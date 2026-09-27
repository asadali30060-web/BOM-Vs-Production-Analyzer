const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { promisify } = require('node:util');
const { boms } = require('./bom-catalog');
const { MAX_UPLOAD_BYTES, validateWorkbook } = require('./uploads');
const scrypt = promisify(crypto.scrypt);
const PENDING_STATUS = 'pending_rules';

function publicUser(user) {
  return user ? { id: user.id, name: user.name, username: user.username, role: user.role } : null;
}

function publicReport(report) {
  return {
    id: report.id,
    name: report.name,
    size: report.size,
    created: report.created,
    bomId: report.bomId || null,
    status: report.bomId ? PENDING_STATUS : 'uploaded',
  };
}

async function readBody(req, limit) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    // Drain oversized requests without keeping bytes or destroying the response.
    if (size <= limit) chunks.push(chunk);
  }
  if (size > limit) {
    const error = new Error(limit === MAX_UPLOAD_BYTES ? 'The uploaded file exceeds the 10 MB limit.' : 'The request is too large.');
    error.status = 413;
    throw error;
  }
  return Buffer.concat(chunks);
}

function createApp({ dataDir = path.join(__dirname, '..', 'data') } = {}) {
  fs.mkdirSync(dataDir, { recursive: true });
  const storeFile = path.join(dataDir, 'workspace.json');
  const store = fs.existsSync(storeFile)
    ? JSON.parse(fs.readFileSync(storeFile, 'utf8'))
    : { accounts: [], analysisReports: [] };
  // Workbook bytes and selections exist only in the current shared session.
  const workspace = { boms: new Map(), reports: [] };
  let generation = 0;
  const sessions = new Map();
  const attempts = new Map();
  const staticFiles = { '/': 'index.html', '/js/app.js': 'js/app.js', '/css/style.css': 'css/style.css' };

  function save() {
    const temporary = storeFile + '.tmp';
    fs.writeFileSync(temporary, JSON.stringify(store, null, 2), { mode: 0o600 });
    fs.renameSync(temporary, storeFile);
  }

  // Remove report records and disk uploads left by earlier app versions.
  // Credentials are retained exactly as stored.
  const hadLegacyReports = 'reports' in store;
  delete store.reports;
  if (hadLegacyReports) save();
  const legacyUploads = path.resolve(dataDir, 'uploads');
  if (path.dirname(legacyUploads) !== path.resolve(dataDir)) throw new Error('Invalid upload directory.');
  if (fs.existsSync(legacyUploads)) {
    if (fs.lstatSync(legacyUploads).isSymbolicLink()) throw new Error('Upload cleanup cannot follow a linked directory.');
    // Remove only files directly inside the app-owned upload directory.
    for (const file of fs.readdirSync(legacyUploads, { withFileTypes: true })) {
      if (file.isFile()) fs.unlinkSync(path.join(legacyUploads, file.name));
    }
  }

  function clearWorkspace() {
    generation++;
    workspace.boms.clear();
    workspace.reports.length = 0;
    sessions.clear();
  }

  function catalog() {
    return boms.map(bom => {
      const uploaded = workspace.boms.get(bom.id);
      return { ...bom, available: Boolean(uploaded), filename: uploaded?.name || null, size: uploaded?.size || null };
    });
  }

  async function readWorkbook(req) {
    let name;
    try { name = decodeURIComponent(req.headers['x-file-name'] || ''); }
    catch { const error = new Error('Invalid filename.'); error.status = 400; throw error; }
    if (!name || name.length > 200 || /[\\/\x00-\x1f]/.test(name)) {
      const error = new Error('Please choose a workbook with a valid filename, up to 200 characters.');
      error.status = 400;
      throw error;
    }
    const buffer = await readBody(req, MAX_UPLOAD_BYTES);
    try { validateWorkbook(name, buffer); }
    catch (error) { error.status = 400; throw error; }
    return { name, size: buffer.length, buffer };
  }

  return http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Security-Policy', "default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:; frame-ancestors 'none'");
    const send = (status, data) => {
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(data));
    };

    try {
      const url = new URL(req.url, 'http://localhost');
      if (req.method === 'GET' && Object.hasOwn(staticFiles, url.pathname)) {
        const file = staticFiles[url.pathname];
        const type = file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html';
        res.setHeader('Content-Type', type + '; charset=utf-8');
        return res.end(fs.readFileSync(path.join(__dirname, '..', 'public', file)));
      }
      if (!url.pathname.startsWith('/api/')) return send(404, { error: 'Not found' });
      const origin = `${req.socket.encrypted ? 'https' : 'http'}://${req.headers.host}`;
      if (req.headers.origin && req.headers.origin !== origin) return send(403, { error: 'Origin not allowed' });

      for (const [key, session] of sessions) if (session.expires <= Date.now()) sessions.delete(key);
      if (!sessions.size && (workspace.boms.size || workspace.reports.length)) clearWorkspace();
      const token = (req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith('session='))?.slice(8);
      const login = sessions.get(token);
      const user = login && login.expires > Date.now() ? publicUser((store.accounts || []).find(u => u.id === login.userId)) : null;
      if (url.pathname === '/api/me' && req.method === 'GET') return send(200, { user, setupRequired: !store.accounts?.length });

      const requestGeneration = generation;
      const bomUpload = url.pathname.match(/^\/api\/boms\/(bom1|bom2)$/);
      const isWorkbookUpload = req.method === 'POST' && (url.pathname === '/api/reports' || bomUpload);
      const authRoute = req.method === 'POST' && ['/api/setup', '/api/signin'].includes(url.pathname);
      if (!user && !authRoute) return send(401, { error: 'Please sign in to continue.' });

      if (user && user.role !== 'admin' && req.method !== 'GET' && !authRoute && url.pathname !== '/api/signout') return send(403, { error: 'This account has view-only access.' });

      let body = {};
      if (req.method === 'POST' && !isWorkbookUpload) {
        const raw = await readBody(req, 16 * 1024);
        try { body = JSON.parse(raw.toString('utf8') || '{}'); }
        catch { return send(400, { error: 'Invalid request.' }); }
        if (!body || typeof body !== 'object' || Array.isArray(body)) return send(400, { error: 'Invalid request.' });
      }

      if (authRoute) {
        const key = req.socket.remoteAddress;
        let attempt = attempts.get(key);
        if (!attempt || attempt.until < Date.now()) attempt = { count: 0, until: Date.now() + 900000 };
        attempts.set(key, attempt);
        if (++attempt.count > 30) return send(429, { error: 'Too many attempts. Please try again in 15 minutes.' });
        let account;
        if (url.pathname === '/api/setup') {
          if (store.accounts?.length) return send(409, { error: 'Accounts are already configured. Please sign in.' });
          const passwords = [body.adminPassword, body.secondaryPassword];
          if (passwords.some(password => typeof password !== 'string' || password.length < 8 || password.length > 128)) {
            return send(400, { error: 'Both passwords must contain 8-128 characters.' });
          }
          if (passwords[0] === passwords[1]) return send(400, { error: 'Use a different password for each account.' });
          const accounts = await Promise.all(['admin', 'secondary'].map(async (username, index) => {
            const salt = crypto.randomBytes(16).toString('hex');
            const hash = (await scrypt(passwords[index], salt, 64)).toString('hex');
            return { id: crypto.randomUUID(), username, name: index === 0 ? 'Admin' : 'Secondary', role: index === 0 ? 'admin' : 'viewer', salt, hash };
          }));
          // Prevent concurrent first-time requests from replacing the accounts.
          if (store.accounts?.length) return send(409, { error: 'Accounts are already configured. Please sign in.' });
          store.accounts = accounts;
          try { save(); } catch (error) { delete store.accounts; throw error; }
          account = accounts[0];
        } else {
          const username = String(body.username || '').trim().toLowerCase();
          const password = String(body.password || '');
          if (password.length < 8 || password.length > 128) return send(400, { error: 'Enter your username and password (8-128 characters).' });
          account = (store.accounts || []).find(candidate => candidate.username === username);
          const hash = await scrypt(password, account?.salt || 'dummy-salt', 64);
          if (!account || !crypto.timingSafeEqual(hash, Buffer.from(account.hash, 'hex'))) return send(401, { error: 'Incorrect username or password.' });
        }
        if (requestGeneration !== generation) return send(409, { error: 'The workspace was reset. Please sign in again.' });
        if (token) sessions.delete(token);
        const next = crypto.randomBytes(32).toString('hex');
        sessions.set(next, { userId: account.id, expires: Date.now() + 7 * 86400000 });
        res.setHeader('Set-Cookie', `session=${next}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800${process.env.COOKIE_SECURE === 'true' ? '; Secure' : ''}`);
        return send(200, { user: publicUser(account) });
      }

      // A sign-out in another tab must also cancel requests already in flight.
      if (requestGeneration !== generation || !sessions.has(token)) return send(401, { error: 'Your session has ended. Please sign in again.' });
      if (url.pathname === '/api/signout' && req.method === 'POST') {
        clearWorkspace();
        res.setHeader('Set-Cookie', 'session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
        return send(200, { ok: true, message: 'Signed out. All session uploads and selections have been cleared.' });
      }
      if (url.pathname === '/api/boms' && req.method === 'GET') {
        return send(200, { boms: catalog() });
      }
      // Completed outputs are persistent and are never part of session cleanup.
      if (url.pathname === '/api/analysis-reports' && req.method === 'GET') {
        return send(200, { reports: store.analysisReports || [] });
      }
      if (url.pathname === '/api/reports' && req.method === 'GET') {
        const reports = workspace.reports.slice().reverse().map(publicReport);
        return send(200, { reports });
      }
      if (isWorkbookUpload) {
        const uploaded = await readWorkbook(req);
        if (requestGeneration !== generation || !sessions.has(token)) return send(401, { error: 'Your session has ended. Please sign in again.' });
        if (bomUpload) {
          const bomId = bomUpload[1];
          workspace.boms.set(bomId, uploaded);
          // Replacing a BOM requires explicitly selecting it again.
          for (const report of workspace.reports) if (report.bomId === bomId) report.bomId = null;
          return send(201, { boms: catalog(), reports: workspace.reports.slice().reverse().map(publicReport), message: 'BOM uploaded for this session.' });
        }
        const report = { ...uploaded, id: crypto.randomUUID(), created: new Date().toISOString(), bomId: null };
        workspace.reports.push(report);
        return send(201, { report: publicReport(report), message: 'Report uploaded successfully.' });
      }
      const selection = url.pathname.match(/^\/api\/reports\/([a-f0-9-]+)\/bom$/);
      if (selection && req.method === 'POST') {
        const report = workspace.reports.find(r => r.id === selection[1]);
        if (!report) return send(404, { error: 'Report not found.' });
        const bom = boms.find(b => b.id === body.bomId);
        if (!bom) return send(400, { error: 'Please select BOM 1 or BOM 2.' });
        if (!workspace.boms.has(bom.id)) return send(400, { error: 'Upload an Excel file for this BOM before selecting it.' });
        report.bomId = bom.id;
        return send(200, { report: publicReport(report), message: 'Analysis rules pending configuration.' });
      }
      if (url.pathname === '/api/analyze' && req.method === 'POST') return send(501, { error: 'Analysis rules pending configuration.' });
      return send(404, { error: 'Not found' });
    } catch (error) {
      if (!error.status || error.status >= 500) console.error(error);
      if (!res.headersSent) send(error.status || 500, { error: error.status ? error.message : 'Something went wrong. Please try again.' });
    }
  });
}

if (require.main === module) {
  const port = process.env.PORT || 3000;
  createApp().listen(port, () => console.log(`Gatronova is running at http://localhost:${port}`));
}
module.exports = { createApp };
