const state = {
  user: null,
  setupRequired: false,
  boms: [],
  reports: [],
  analysisReports: [],
  report: null,
  page: 'workspace',
  uploading: false,
  saving: false,
};
const $ = selector => document.querySelector(selector);
const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]));
let toastTimer;

async function api(endpoint, options = {}) {
  const response = await fetch('/api/' + endpoint, options);
  const data = await response.json();
  if (!response.ok) {
    if (response.status === 401 && !['signin', 'setup'].includes(endpoint)) {
      clearSession();
      render();
    }
    throw new Error(data.error || 'Request failed. Please try again.');
  }
  return data;
}

function post(endpoint, data) {
  return api(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

function notify(message) {
  clearTimeout(toastTimer);
  $('#toast').textContent = message;
  $('#toast').classList.add('show');
  toastTimer = setTimeout(() => $('#toast').classList.remove('show'), 5000);
}

function clearSession() {
  Object.assign(state, { user: null, boms: [], reports: [], analysisReports: [], report: null, page: 'workspace', uploading: false, saving: false });
}

async function loadWorkspace() {
  const [catalog, uploads, saved] = await Promise.all([api('boms'), api('reports'), api('analysis-reports')]);
  state.boms = catalog.boms;
  state.reports = uploads.reports;
  state.analysisReports = saved.reports;
  state.report = state.reports[0] || null;
}

function render() {
  if (!state.user) {
    $('#app').innerHTML = `
      <div class="welcome-shell">
        <header><a class="brand" href="/"><span class="brand-mark">G</span><span class="brand-name">Gatronova</span></a>
          <div><button class="text-button" data-auth="signin">Sign in</button>
          ${state.setupRequired ? '<button class="button small" data-auth="setup">Set up accounts &rarr;</button>' : ''}</div>
        </header>
        <main class="welcome-main">
          <div class="eyebrow">BOM & PRODUCTION WORKSPACE</div>
          <h1>Your production reports.<br>Your workspace.</h1>
          <p>Sign in to access your BOM library, upload an Excel production report, and select the BOM you want to use.</p>
          <div class="welcome-actions">${state.setupRequired ? '<button class="button" data-auth="setup">Set up accounts &rarr;</button>' : ''}
            <button class="button secondary" data-auth="signin">Sign in</button></div>
          <div class="welcome-steps"><span>01 &nbsp; Sign in</span><span>02 &nbsp; Upload report</span><span>03 &nbsp; Select a BOM</span></div>
          <p class="welcome-note">Analysis rules are pending configuration.</p>
        </main>
      </div>`;
    bindAuthentication();
    return;
  }

  const user = state.user;
  const isAdmin = user.role === 'admin';
  $('#app').innerHTML = `
    <aside>
      <a class="brand" href="/"><span class="brand-mark">G</span><span class="brand-name">Gatronova</span></a>
      <div class="workspace"><span class="workspace-icon">W</span><div>My workspace<small>Production workspace</small></div></div>
      <div class="nav-label">WORKSPACE</div>
      <nav>${[['workspace', '▦', isAdmin ? 'Upload & select' : 'Workspace'], ['reports', '▤', 'Session uploads'], ['results', '▥', 'Analysis reports']].map(([page, icon, name]) => `
        <button data-page="${page}" class="${state.page === page ? 'active' : ''}" aria-label="${name}" ${state.uploading || state.saving ? 'disabled' : ''}>
          <span>${icon}</span>${name}
        </button>`).join('')}</nav>
      <div class="sidebar-bottom">
        <div class="help-box"><span>◇</span><strong>Your session workspace.</strong><p>${isAdmin ? 'Upload your report and BOM files from your computer.' : 'View the reference BOMs and saved reports.'}</p></div>
        <div class="profile"><div class="avatar">${escapeHtml(user.name[0].toUpperCase())}</div>
          <div><strong>${escapeHtml(user.name)}</strong><small>${isAdmin ? 'Administrator' : 'View only'}</small></div>
          <button id="signout" aria-label="Sign out" title="Sign out" ${state.uploading || state.saving ? 'disabled' : ''}>↪</button>
        </div>
      </div>
    </aside>
    <div class="main-shell">
      <header><span>Workspace <b>/</b> ${state.page === 'results' ? 'Analysis reports' : state.page === 'reports' ? 'Session uploads' : isAdmin ? 'Upload & select' : 'Workspace'}</span>
        <div><span class="system"><i></i> Signed in</span><span class="header-avatar">${escapeHtml(user.name[0].toUpperCase())}</span></div>
      </header>
      <main>
        <div class="page-heading"><div><div class="eyebrow">PRODUCTION WORKSPACE</div>
          <h1>${state.page === 'results' ? 'Saved analysis reports' : state.page === 'reports' ? 'Session uploads' : isAdmin ? 'From report to the right BOM.' : 'Your production workspace.'}</h1>
          <p>${state.page === 'results' ? 'Completed analysis reports are kept after sign-out. Generation is pending analyzer rules.' : !isAdmin ? 'View-only access to the BOM library, uploaded reports, and saved selections.' : state.page === 'reports' ? 'Reopen a report to review or change its BOM selection.' : 'Upload your production report, then select the BOM you want to use.'}</p>
        </div></div>
        <p class="session-notice">Signing out clears uploaded BOMs, production files, and selections for both users. Saved analysis reports and passwords are kept.</p>
        ${state.page === 'results' ? analysisReportsView() : state.page === 'reports' || !isAdmin ? reportsView() : uploadView()}
        ${bomLibrary()}
        <footer><span><span class="tiny-logo">G</span> Gatronova &middot; BOM & Production Analyzer</span><span>Analysis rules pending configuration</span></footer>
      </main>
    </div>`;
  bindWorkspace();
}

function uploadView() {
  const report = state.report;
  const step = report ? report.bomId ? 3 : 2 : 1;
  return `
    <div class="flow">${['Upload report', 'Choose a BOM', 'Selection saved'].map((label, index) => `
      <div class="${step >= index + 1 ? 'current' : ''}"><span>${step > index + 1 ? '✓' : index + 1}</span>${label}${index < 2 ? '<b>────────</b>' : ''}</div>`).join('')}
    </div>
    <section class="panel upload-panel">
      <div class="section-heading"><div><h2><span class="number">01</span> Upload your production report</h2>
        <p>Your Excel workbook is available only during this shared session.</p></div><span class="tag">EXCEL .XLSX</span></div>
      <label class="dropzone ${report ? 'uploaded' : ''}" id="dropzone" tabindex="0" aria-label="Upload Excel production report" aria-busy="${state.uploading}">
        <input type="file" id="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden ${state.uploading || state.saving ? 'disabled' : ''}>
        <span class="upload-icon">${state.uploading ? '…' : report ? '✓' : '↥'}</span>
        <strong>${state.uploading ? 'Uploading your report…' : report ? 'Report uploaded successfully.' : 'Drag and drop your Excel report here'}</strong>
        <p>${report ? escapeHtml(report.name) : 'or <span>browse files</span> from your computer'}</p>
        <small>${report ? `${formatSize(report.size)} · Click to upload another report` : 'Excel .xlsx files up to 10 MB'}</small>
      </label>
      ${report ? '<div class="upload-success" role="status">Which BOM would you like to use? Choose from the library below.</div>' : '<p class="upload-note">Upload your COOIS production report to get started.</p>'}
    </section>`;
}

function bomLibrary() {
  const isAdmin = state.user.role === 'admin';
  const report = state.page === 'workspace' ? state.report : null;
  const chosen = state.boms.find(bom => bom.id === report?.bomId);
  return `
    <section class="bom-section" aria-labelledby="bom-heading">
      <div class="section-heading"><div><h2 id="bom-heading"><span class="number">${state.page === 'workspace' ? '02' : '◇'}</span> ${report && isAdmin ? 'Which BOM would you like to use?' : 'Your BOM library'}</h2>
        <p>${report && isAdmin ? 'Upload your BOM files below, then select the one to use.' : 'Upload BOM 1 and BOM 2 from your computer for this session.'}</p></div>
        <span class="muted">${state.boms.length} BOMs</span></div>
      <div class="bom-grid workbook-grid">${state.boms.map((bom, index) => `
        <article class="bom-card workbook-card ${report?.bomId === bom.id ? 'selected' : ''}">
          <div class="workbook-art ${index ? 'green' : 'purple'}"><span class="category">SESSION BOM</span>
            <div class="workbook-icon" aria-hidden="true"><span>▤</span><small>XLSX</small></div>
            ${report?.bomId === bom.id ? '<span class="radio checked">✓</span>' : ''}</div>
          <div class="bom-info"><h3 class="bom-title">${escapeHtml(bom.name)}</h3><p>${escapeHtml(bom.filename || 'No file uploaded')}</p>
            <div class="bom-meta"><span>${bom.available ? 'Uploaded for this session' : 'Upload required'}</span><span>Excel</span></div>
            ${isAdmin ? `<label class="button secondary bom-upload-button" tabindex="0" role="button" aria-label="Upload ${escapeHtml(bom.name)}">
              <input type="file" data-bom-upload="${bom.id}" accept=".xlsx" hidden ${state.uploading || state.saving ? 'disabled' : ''}>
              ${bom.available ? 'Replace Excel file' : 'Upload Excel file'}
            </label>` : ''}
            ${report && isAdmin ? `<button class="button ${report.bomId === bom.id ? 'secondary' : ''} select-bom" data-bom="${bom.id}" aria-pressed="${report.bomId === bom.id}" ${state.uploading || state.saving || !bom.available ? 'disabled' : ''}>${report.bomId === bom.id ? '✓ Selected' : 'Select this BOM'}</button>` : `<small class="selection-hint">${isAdmin ? 'Upload or open a report to select this BOM.' : 'View only - Reference workbook'}</small>`}
          </div>
        </article>`).join('')}</div>
      ${state.saving ? '<p class="upload-success" role="status">Saving your BOM selection…</p>' : ''}
      ${chosen ? `<section class="panel selection-summary" aria-labelledby="selection-heading" role="status">
        <div class="section-heading"><div><h2 id="selection-heading"><span class="success-icon">✓</span> Selection saved for this session</h2><p>${isAdmin ? 'You can change the selected BOM above at any time.' : 'BOM selection saved by the administrator.'}</p></div>
          ${isAdmin ? `<button class="button secondary" id="new-report" ${state.uploading || state.saving ? 'disabled' : ''}>Upload another report</button>` : ''}</div>
        <dl><div><dt>Production report</dt><dd>${escapeHtml(report.name)}</dd></div><div><dt>Selected BOM</dt><dd>${escapeHtml(chosen.name)}</dd></div></dl>
        <div class="pending-message"><span>◷</span><div><strong>Analysis rules pending configuration.</strong><p>This selection lasts for the session. Completed analysis reports will be kept once the analyzer rules are configured.</p></div></div>
        ${isAdmin ? '<button class="button" disabled>Run analyzer &mdash; coming later</button>' : ''}
      </section>` : ''}
    </section>`;
}

function reportsView() {
  if (!state.reports.length && state.user.role !== 'admin') return '<section class="panel empty"><span>&#9636;</span><h2>No reports uploaded yet</h2><p>Reports will appear here once the administrator uploads them.</p></section>';
  if (!state.reports.length) return '<section class="panel empty"><span>▤</span><h2>No reports uploaded yet</h2><p>Upload your first Excel production report to get started.</p><button class="button" data-page="workspace">Upload report →</button></section>';
  return `<section class="panel"><div class="table-scroll"><table><thead><tr><th>Report</th><th>Uploaded</th><th>Selected BOM</th><th>Status</th><th></th></tr></thead><tbody>
    ${state.reports.map(report => `<tr><td><strong>${escapeHtml(report.name)}</strong><small>${formatSize(report.size)}</small></td>
      <td>${new Date(report.created).toLocaleDateString()}</td><td>${escapeHtml(state.boms.find(bom => bom.id === report.bomId)?.name || 'Not selected')}</td>
      <td><span class="badge">${report.bomId ? 'Rules pending' : 'Choose a BOM'}</span></td>
      <td><button class="text-button" data-report="${report.id}">Open →</button></td></tr>`).join('')}
    </tbody></table></div></section>`;
}

function savedReportBody(report) {
  const rows = Array.isArray(report.rows) ? report.rows : [];
  const columns = [...new Set(rows.flatMap(row => Object.keys(row)))];
  return `<h2>${escapeHtml(report.title || 'Analysis report')}</h2>
    <p>${report.created ? escapeHtml(new Date(report.created).toLocaleString()) : ''}</p>
    ${report.sourceReportName ? `<p>Production report: ${escapeHtml(report.sourceReportName)}</p>` : ''}
    ${report.bomName ? `<p>BOM: ${escapeHtml(report.bomName)}</p>` : ''}
    <p>${escapeHtml(report.summary || '')}</p>
    ${rows.length ? `<div class="table-scroll"><table><thead><tr>${columns.map(column => `<th>${escapeHtml(column.replace(/([A-Z])/g, ' $1').replace(/_/g, ' '))}</th>`).join('')}</tr></thead>
      <tbody>${rows.map(row => `<tr>${columns.map(column => `<td>${escapeHtml(row[column] ?? '')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : ''}`;
}

function analysisReportsView() {
  if (!state.analysisReports.length) return '<section class="panel empty"><span>&#9636;</span><h2>No analysis reports yet</h2><p>Report generation will be available after the analyzer rules are configured. Completed reports will stay here after sign-out and restarting the app.</p></section>';
  return `<section class="panel saved-results">${state.analysisReports.map(report => `
    <article>${savedReportBody(report)}<button class="button secondary" data-download-result="${escapeHtml(report.id)}">Download report</button></article>`).join('')}</section>`;
}

function downloadAnalysisReport(report) {
  // A standalone HTML document opens in any browser, without this app or uploads.
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(report.title || 'Gatronova analysis report')}</title>
    <style>body{font-family:Arial,sans-serif;margin:40px;color:#252333}table{border-collapse:collapse;width:100%;margin:20px 0}td,th{border:1px solid #ddd;padding:10px;text-align:left}th{background:#f4f1fa}.table-scroll{overflow:auto}p{white-space:pre-wrap}</style></head>
    <body><h1>Gatronova</h1>${savedReportBody(report)}</body></html>`;
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'Gatronova-analysis-report.html';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function refreshWorkspace() {
  const [catalog, uploads, saved] = await Promise.all([api('boms'), api('reports'), api('analysis-reports')]);
  if (!state.user) return;
  const selectedId = state.report?.id;
  state.boms = catalog.boms;
  state.reports = uploads.reports;
  state.analysisReports = saved.reports;
  state.report = state.reports.find(report => report.id === selectedId) || null;
}

function formatSize(bytes) {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`;
}

function bindAuthentication() {
  document.querySelectorAll('[data-auth]').forEach(button => {
    button.onclick = () => showAuth(button.dataset.auth);
  });
}

function updateReport(report) {
  state.report = report;
  const index = state.reports.findIndex(item => item.id === report.id);
  if (index === -1) state.reports.unshift(report);
  else state.reports[index] = report;
}

async function upload(file, bomId = null) {
  if (!file || state.uploading || state.saving) return;
  if (!state.user) return showAuth('signin');
  if (state.user.role !== 'admin') return notify('This account has view-only access.');
  if (!file.name.toLowerCase().endsWith('.xlsx') || !file.size || file.size > 10 * 1024 * 1024) {
    notify('Please choose a nonempty Excel .xlsx workbook up to 10 MB.');
    return;
  }
  state.uploading = true;
  render();
  try {
    const result = await api(bomId ? `boms/${bomId}` : 'reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'X-File-Name': encodeURIComponent(file.name) },
      body: file,
    });
    if (bomId) {
      state.boms = result.boms;
      state.reports = result.reports;
      state.report = state.reports.find(report => report.id === state.report?.id) || null;
      notify('BOM uploaded for this session. Select it below when your production report is ready.');
    } else {
      updateReport(result.report);
      notify('Report uploaded successfully. Please select a BOM.');
    }
  } catch (error) {
    notify(error.message);
  } finally {
    state.uploading = false;
    render();
  }
}

function bindWorkspace() {
  document.querySelectorAll('[data-download-result]').forEach(button => {
    button.onclick = () => {
      const report = state.analysisReports.find(item => item.id === button.dataset.downloadResult);
      if (report) downloadAnalysisReport(report);
    };
  });
  document.querySelectorAll('[data-bom-upload]').forEach(input => {
    input.onchange = event => upload(event.target.files[0], input.dataset.bomUpload);
    input.parentElement.onkeydown = event => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); input.click(); }
    };
  });
  document.querySelectorAll('[data-page]').forEach(button => {
    button.onclick = async () => {
      try {
        await refreshWorkspace();
        if (state.user) { state.page = button.dataset.page; render(); }
      } catch (error) { notify(error.message); }
    };
  });
  $('#signout').onclick = async () => {
    try { await post('signout', {}); clearSession(); render(); notify('Signed out. Session uploads cleared; saved analysis reports kept.');
      sessionChannel.postMessage('signed-out'); }
    catch (error) { notify(error.message); }
  };
  document.querySelectorAll('[data-report]').forEach(button => {
    button.onclick = () => { state.report = state.reports.find(report => report.id === button.dataset.report); state.page = 'workspace'; render(); };
  });
  document.querySelectorAll('[data-bom]').forEach(button => {
    button.onclick = async () => {
      if (state.user.role !== 'admin' || !state.report || state.saving || state.uploading) return;
      state.saving = true;
      render();
      try {
        const { report } = await post(`reports/${state.report.id}/bom`, { bomId: button.dataset.bom });
        updateReport(report);
        notify('BOM selection saved. Analysis rules pending configuration.');
      } catch (error) { notify(error.message); }
      finally { state.saving = false; render(); }
    };
  });
  if ($('#new-report')) $('#new-report').onclick = () => { state.report = null; render(); $('#dropzone').focus(); };
  if ($('#file')) {
    $('#file').onchange = event => upload(event.target.files[0]);
    const dropzone = $('#dropzone');
    dropzone.onkeydown = event => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); $('#file').click(); }
    };
    dropzone.ondragover = event => { event.preventDefault(); dropzone.classList.add('dragging'); };
    dropzone.ondragleave = () => dropzone.classList.remove('dragging');
    dropzone.ondrop = event => { event.preventDefault(); dropzone.classList.remove('dragging'); upload(event.dataTransfer.files[0]); };
  }
}

function showAuth(mode) {
  const setup = mode === 'setup';
  const root = $('#modal-root');
  const previousFocus = document.activeElement;
  root.innerHTML = `<div class="overlay"><section class="auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-title">
    <button class="close" aria-label="Close">&times;</button><div class="brand-mark">G</div>
    <h2 id="auth-title">${setup ? 'Set up Gatronova.' : 'Welcome back.'}</h2>
    <p>${setup ? 'Set passwords for the two accounts. This setup runs once.' : 'Sign in with your admin or secondary username.'}</p>
    <form id="auth-form">
      ${setup ? `
        <label>admin - full access<input name="adminPassword" type="password" autocomplete="new-password" minlength="8" maxlength="128" required placeholder="Set admin password"></label>
        <label>secondary - view only<input name="secondaryPassword" type="password" autocomplete="new-password" minlength="8" maxlength="128" required placeholder="Set secondary password"></label>
        <p>Use different passwords, with at least 8 characters each.</p>
      ` : `
        <label>Username<input name="username" autocomplete="username" required maxlength="32" placeholder="admin or secondary"></label>
        <label>Password<input name="password" type="password" autocomplete="current-password" minlength="8" maxlength="128" required placeholder="Your password"></label>
      `}
      <p class="form-error" role="alert"></p><button class="button" type="submit">${setup ? 'Save accounts & sign in' : 'Sign in'} &rarr;</button>
    </form>
  </section></div>`;
  let submitting = false;
  function close() {
    root.innerHTML = '';
    document.removeEventListener('keydown', keydown);
    if (previousFocus?.isConnected) previousFocus.focus();
  }
  function keydown(event) {
    if (event.key === 'Escape' && !submitting) close();
    if (event.key === 'Tab') {
      const elements = [...root.querySelectorAll('button:not(:disabled),input:not(:disabled)')];
      const first = elements[0], last = elements.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  }
  document.addEventListener('keydown', keydown);
  root.querySelector('.close').onclick = () => { if (!submitting) close(); };
  root.querySelector('input').focus();
  $('#auth-form').onsubmit = async event => {
    event.preventDefault();
    if (submitting) return;
    submitting = true;
    const form = event.target;
    const values = Object.fromEntries(new FormData(form));
    root.querySelectorAll('button').forEach(button => { button.disabled = true; });
    form.querySelector('.form-error').textContent = '';
    try {
      state.user = (await post(mode, values)).user;
      state.setupRequired = false;
      await loadWorkspace();
      close();
      render();
      notify(setup ? 'Both accounts are ready. You are signed in as admin.' : 'Signed in successfully.');
    } catch (error) {
      clearSession();
      form.querySelector('.form-error').textContent = error.message;
      root.querySelectorAll('button').forEach(button => { button.disabled = false; });
      submitting = false;
    }
  };
}

async function initialize() {
  try {
    const session = await api('me');
    state.user = session.user;
    state.setupRequired = session.setupRequired;
    if (state.user) await loadWorkspace();
    render();
  } catch {
    clearSession();
    render();
    notify('Unable to load your workspace. Please sign in again or refresh the page.');
  }
}
// Clear other tabs promptly after sign-out and recheck sessions on focus.
const sessionChannel = new BroadcastChannel('gatronova-session');
sessionChannel.onmessage = event => {
  if (event.data === 'signed-out') { clearSession(); render(); }
};
window.addEventListener('focus', async () => {
  if (!state.user || state.uploading || state.saving) return;
  try { await refreshWorkspace(); render(); } catch (error) { notify(error.message); }
});
setInterval(async () => {
  if (!state.user || state.uploading || state.saving || document.hidden) return;
  try {
    const session = await api('me');
    if (!session.user) { clearSession(); render(); notify('Session ended. Uploaded files were cleared.'); }
  } catch { /* Retry when the server is reachable again. */ }
}, 5000);
initialize();
