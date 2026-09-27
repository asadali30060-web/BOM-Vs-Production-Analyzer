const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { once } = require('node:events');
const { createApp } = require('../src/server');
const { validateWorkbook, MAX_UPLOAD_BYTES } = require('../src/uploads');
const workbook = require('./workbook-fixture');

test('Excel upload validation uses synthetic workbooks, not real company data', () => {
  assert.doesNotThrow(() => validateWorkbook('test.xlsx', workbook));
  assert.throws(() => validateWorkbook('report.csv', workbook), /xlsx/);
  assert.throws(() => validateWorkbook('report.xlsx', Buffer.from('not Excel')), /valid Excel/);
  assert.throws(() => validateWorkbook('report.xlsx', workbook.subarray(0, 100)), /incomplete/);
  assert.throws(() => validateWorkbook('report.xlsx', Buffer.alloc(0)), /nonempty/);
  assert.throws(() => validateWorkbook('report.xlsx', Buffer.alloc(MAX_UPLOAD_BYTES + 1)), /10 MB/);
});

test('session uploads clear on sign-out and restart; credentials and completed outputs persist', async t => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gatronova-workflow-'));
  const savedOutput = { id: 'saved-1', title: 'Previously completed analysis', created: '2026-09-27T00:00:00Z', summary: 'Synthetic persisted output', rows: [{ material: 'Example', variance: 0 }] };
  fs.mkdirSync(path.join(dataDir, 'uploads'));
  fs.writeFileSync(path.join(dataDir, 'uploads', 'legacy.xlsx'), workbook);
  fs.writeFileSync(path.join(dataDir, 'workspace.json'), JSON.stringify({ accounts: [], reports: [{ name: 'legacy.xlsx' }], analysisReports: [savedOutput] }));
  let server;
  let base;
  async function start() {
    server = createApp({ dataDir });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    base = `http://127.0.0.1:${server.address().port}`;
  }
  async function stop() {
    const closed = new Promise(resolve => server.close(resolve));
    server.closeAllConnections();
    await closed;
  }
  t.after(async () => {
    if (server.listening) await stop();
    const resolved = path.resolve(dataDir);
    if (path.dirname(resolved) !== path.resolve(os.tmpdir()) || !path.basename(resolved).startsWith('gatronova-workflow-')) throw Error('Invalid temporary directory.');
    fs.rmSync(resolved, { recursive: true, force: true });
  });
  await start();
  assert.equal(fs.existsSync(path.join(dataDir, 'uploads', 'legacy.xlsx')), false);
  async function request(endpoint, { cookie, json, file, name, status = 200 } = {}) {
    const response = await fetch(base + '/api/' + endpoint, {
      method: json !== undefined || file ? 'POST' : 'GET',
      headers: { ...(cookie ? { Cookie: cookie } : {}), ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(file ? { 'X-File-Name': encodeURIComponent(name || 'synthetic.xlsx') } : {}) },
      body: file || (json !== undefined ? JSON.stringify(json) : undefined),
    });
    const data = await response.json();
    assert.equal(response.status, status, JSON.stringify(data));
    return { data, cookie: response.headers.get('set-cookie')?.split(';')[0] };
  }
  for (const route of ['/', '/js/app.js', '/css/style.css']) assert.equal((await fetch(base + route)).status, 200);
  for (const route of ['boms', 'reports', 'analysis-reports']) await request(route, { status: 401 });
  const credentials = { username: 'admin', password: 'Example-password-123' };
  const setup = { adminPassword: credentials.password, secondaryPassword: 'Viewer-password-456' };
  const { cookie } = await request('setup', { json: setup });
  const accountsBefore = JSON.stringify(JSON.parse(fs.readFileSync(path.join(dataDir, 'workspace.json'))).accounts);
  await request('setup', { json: setup, status: 409 });
  const catalog = (await request('boms', { cookie })).data.boms;
  assert.deepEqual(catalog.map(b => b.id), ['bom1', 'bom2']);
  assert.ok(catalog.every(b => !b.available && b.filename === null));
  assert.deepEqual((await request('analysis-reports', { cookie })).data.reports, [savedOutput]);
  await request('boms/bom1', { cookie, file: Buffer.from('invalid'), status: 400 });
  await request('boms/bom1', { cookie, file: Buffer.alloc(MAX_UPLOAD_BYTES + 1), status: 413 });
  await request('boms/bom1', { cookie, file: workbook, name: '../escape.xlsx', status: 400 });
  const { report } = (await request('reports', { cookie, file: workbook, status: 201 })).data;
  await request(`reports/${report.id}/bom`, { cookie, json: { bomId: 'bom1' }, status: 400 });
  for (const id of ['bom1', 'bom2']) await request('boms/' + id, { cookie, file: workbook, name: id + '.xlsx', status: 201 });
  const selected = (await request(`reports/${report.id}/bom`, { cookie, json: { bomId: 'bom1' } })).data.report;
  assert.equal(selected.status, 'pending_rules');
  const replaced = (await request('boms/bom1', { cookie, file: workbook, name: 'replacement.xlsx', status: 201 })).data;
  assert.equal(replaced.reports[0].bomId, null);
  await request(`reports/${report.id}/bom`, { cookie, json: { bomId: 'bom2' } });
  await request('analyze', { cookie, json: {}, status: 501 });
  const viewer = await request('signin', { json: { username: 'secondary', password: setup.secondaryPassword, role: 'admin' } });
  assert.equal(viewer.data.user.role, 'viewer');
  assert.equal((await request('reports', { cookie: viewer.cookie })).data.reports[0].bomId, 'bom2');
  assert.equal((await request('boms', { cookie: viewer.cookie })).data.boms.filter(b => b.available).length, 2);
  for (const endpoint of ['reports', 'boms/bom1']) await request(endpoint, { cookie: viewer.cookie, file: workbook, status: 403 });
  await request(`reports/${report.id}/bom`, { cookie: viewer.cookie, json: { bomId: 'bom1' }, status: 403 });
  const onDisk = JSON.parse(fs.readFileSync(path.join(dataDir, 'workspace.json')));
  assert.equal(onDisk.reports, undefined);
  assert.deepEqual(fs.readdirSync(path.join(dataDir, 'uploads')), []);
  await request('signout', { cookie: viewer.cookie, json: {} });
  await request('boms', { cookie, status: 401 });
  await request('boms', { cookie: viewer.cookie, status: 401 });
  const fresh = await request('signin', { json: credentials });
  assert.deepEqual((await request('reports', { cookie: fresh.cookie })).data.reports, []);
  assert.ok((await request('boms', { cookie: fresh.cookie })).data.boms.every(b => !b.available));
  assert.deepEqual((await request('analysis-reports', { cookie: fresh.cookie })).data.reports, [savedOutput]);

  // Logout while an upload is still being sent must not recreate cleared data.
  const slow = http.request(base + '/api/boms/bom1', { method: 'POST', headers: { Cookie: fresh.cookie, 'X-File-Name': 'slow.xlsx' } });
  const slowResponse = new Promise((resolve, reject) => {
    slow.on('response', response => { response.resume(); response.on('end', () => resolve(response.statusCode)); });
    slow.on('error', reject);
  });
  slow.write(workbook.subarray(0, 100));
  await new Promise(resolve => setTimeout(resolve, 30));
  await request('signout', { cookie: fresh.cookie, json: {} });
  slow.end(workbook.subarray(100));
  assert.equal(await slowResponse, 401);
  const next = await request('signin', { json: credentials });
  await request('boms/bom1', { cookie: next.cookie, file: workbook, status: 201 });
  await request('reports', { cookie: next.cookie, file: workbook, status: 201 });
  await stop();
  await start();
  const restarted = await request('signin', { json: credentials });
  assert.deepEqual((await request('reports', { cookie: restarted.cookie })).data.reports, []);
  assert.ok((await request('boms', { cookie: restarted.cookie })).data.boms.every(b => !b.available));
  assert.deepEqual((await request('analysis-reports', { cookie: restarted.cookie })).data.reports, [savedOutput]);
  assert.equal(JSON.stringify(JSON.parse(fs.readFileSync(path.join(dataDir, 'workspace.json'))).accounts), accountsBefore);
  for (const route of ['/assets/boms/example.xlsx', '/data/workspace.json']) assert.equal((await fetch(base + route)).status, 404);
});
