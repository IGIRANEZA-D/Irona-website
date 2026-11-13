const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const root = $('#admin-root');
let adminUser = null;
let contentItems = [];
let activeSection = 'overview';
let editingItem = null;
let draftPayload = {};
let autosaveTimer = null;
let editorDirty = false;
let editorSaving = false;
let editorBaseRevision = 0;
let editorSectionObserver = null;
let editorChangeVersion = 0;
setInterval(() => {
  const status = $('#editor-save-status'); const savedAt = Number(status?.dataset.savedAt || 0);
  if (savedAt && !editorDirty) { const minutes = Math.floor((Date.now() - savedAt) / 60000); const when = minutes < 1 ? 'just now' : `${minutes} minute${minutes === 1 ? '' : 's'} ago`; status.textContent = editingItem?.status === 'published' ? `Draft saved privately ${when}. Press Update to apply it.` : `Saved ${when}`; }
}, 15000);
async function prepareToLeaveEditor() {
  clearTimeout(autosaveTimer);
  if (editorDirty) await saveEditorDraft();
  if (editorDirty) { toast('Your changes have not saved yet. Please stay here and try again.', true); return false; }
  return true;
}
let toastTimer;
let removeProfilePhoto = false;
const types = {
  vacancy: { label: 'Vacancies', singular: 'vacancy', icon: 'briefcase', empty: 'No vacancies yet. Add a role to make opportunities visible to applicants.' },
  program: { label: 'Programs', singular: 'program', icon: 'spark', empty: 'No programs yet. Publish an open call or describe a current initiative.' },
  publication: { label: 'Insights', singular: 'insight', icon: 'publication', empty: 'No insights yet. Add a report, research article or story from IRONA’s work.' },
  event: { label: 'Events & activities', singular: 'activity', icon: 'calendar', empty: 'No activities yet. Share a training, event or completed piece of work.' },
};
const icons = {
  overview: '<rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="11" width="7" height="10" rx="1.5"/><rect x="3" y="14" width="8" height="7" rx="1.5"/>',
  vacancy: '<rect x="3" y="7" width="18" height="14" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18m-11 0v2h4v-2"/>',
  program: '<path d="m12 3 2.4 5.1 5.6.8-4 3.9 1 5.6-5-2.7-5 2.7 1-5.6-4-3.9 5.6-.8L12 3Z"/>',
  publication: '<path d="M6 3h8l4 4v14H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm8 0v5h5M8 12h8m-8 4h8"/>',
  event: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18m4 5h3m-3 3h3"/>',
  news: '<path d="M5 4h14v16H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm4 4h6m-6 4h8m-8 4h8"/>',
  eye: '<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z"/><circle cx="12" cy="12" r="2.5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  inbox: '<path d="M4 4h16v13h-5l-3 3-3-3H4V4Z"/><path d="M8 9h8m-8 4h5"/>',
  security: '<path d="M12 3 20 6v5c0 5-3.4 8.5-8 10-4.6-1.5-8-5-8-10V6l8-3Z"/><path d="m9 12 2 2 4-4"/>',
  search: '<circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 5 5"/>',
};
function escapeHtml(value = '') { return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char])); }
function adminRequestError(error) {
  if (error instanceof TypeError && /fetch/i.test(error.message)) return 'Cannot reach the IRONA server. Start npm run dev and keep that terminal open while you sign in.';
  if (error.name === 'TimeoutError' || error.name === 'AbortError') return 'The request timed out. Check the server and database connection, then try again.';
  return error.message || 'The request could not be completed.';
}
function svg(name) { return `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name] || icons.document}</svg>`; }
function dateLabel(value) { if (!value) return 'Not set'; const date = new Date(value); return Number.isNaN(date.getTime()) ? 'Not set' : new Intl.DateTimeFormat('en', { timeZone: 'Africa/Kigali', day: 'numeric', month: 'short', year: 'numeric' }).format(date); }
function dateInput(value) { if (!value) return ''; const date = new Date(value); return Number.isNaN(date.getTime()) ? '' : new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16); }
function kigaliDateInput(value) { if (!value) return ''; const date = new Date(value); if (Number.isNaN(date.getTime())) return ''; const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Kigali', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date); const values = Object.fromEntries(parts.map(part => [part.type, part.value])); return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}`; }
function eventActivityState(item = draftPayload, now = Date.now()) { const lifecycleDate = item.endsAt || item.startsAt; const timestamp = lifecycleDate ? new Date(lifecycleDate).getTime() : NaN; return Number.isFinite(timestamp) && timestamp < now ? 'completed' : 'upcoming'; }
function syncEventConditionalFields() { if (draftPayload.type !== 'event') return; draftPayload.activityState = eventActivityState(draftPayload); $$('[data-event-state-field]').forEach(node => { node.hidden = node.dataset.eventStateField !== draftPayload.activityState; }); const note = $('#event-editor-state-note'); if (note) note.textContent = draftPayload.activityState === 'upcoming' ? 'Upcoming activity: the registration link is optional. When provided, it appears on the public page as a registration button.' : 'Completed activity: registration is hidden from visitors. Add outcomes only when there are results to share.'; }
function kigaliDateValue(value) { if (!value) return ''; const raw = String(value).trim(); const date = new Date(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(raw) ? `${raw}:00+02:00` : raw); return Number.isNaN(date.getTime()) ? '' : date.toISOString(); }
function readTime(item) { const words = String(item.content || '').trim().split(/\s+/).filter(Boolean).length; return Math.max(1, Math.ceil(words / 220)); }
function toast(message, error = false) { const node = $('#admin-toast'); node.textContent = message; node.classList.toggle('error', error); node.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => node.classList.remove('show'), 3400); }
const adminTransitionMinimum = 650;
let adminTransitionStarted = 0;
function showAdminTransition(message = 'Opening IRONA workspace') {
  const overlay = $('#admin-transition'); if (!overlay) return;
  // Keep an in-flight transition stable if auth startup and a button action overlap.
  if (!overlay.classList.contains('is-hidden') && adminTransitionStarted) { $('#admin-transition-message').textContent = message; return; }
  adminTransitionStarted = performance.now();
  $('#admin-transition-message').textContent = message;
  overlay.classList.remove('is-hidden');
}
let adminTransitionHidePromise = null;
async function waitForAdminTransitionMinimum() {
  const remaining = Math.max(0, adminTransitionMinimum - (performance.now() - adminTransitionStarted));
  if (remaining) await new Promise(resolve => setTimeout(resolve, remaining));
}
function hideAdminTransition() {
  const overlay = $('#admin-transition'); if (!overlay || overlay.classList.contains('is-hidden')) return;
  if (adminTransitionHidePromise) return adminTransitionHidePromise;
  adminTransitionHidePromise = (async () => {
    await waitForAdminTransitionMinimum();
    overlay.classList.add('is-hidden');
  })().finally(() => { adminTransitionHidePromise = null; });
  return adminTransitionHidePromise;
}
async function api(url, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body && !(options.body instanceof FormData)) headers['Content-Type'] = 'application/json';
  const response = await fetch(url, { credentials: 'same-origin', ...options, headers });
  const data = response.headers.get('content-type')?.includes('application/json') ? await response.json() : {};
  if (!response.ok) throw new Error(data.error || 'The request could not be completed.');
  return data;
}
function renderLogin(message = '') {
  root.innerHTML = `<div class="admin-login-shell"><section class="admin-login-photo" aria-label="IRONA team member"><a class="admin-login-photo-brand" href="/" aria-label="IRONA home"><img src="/assets/irona-logo.png" alt="IRONA Consultants Ltd"></a><div class="admin-login-photo-copy"><span>IRONA ADMINISTRATION</span><h2>Work that matters.</h2><p>Authorised staff only.</p></div></section><section class="admin-login-side"><div class="admin-login-panel" aria-labelledby="admin-login-title"><div class="admin-login-heading"><span>IRONA ADMINISTRATION</span><h1 id="admin-login-title">ADMIN LOGIN</h1></div><form class="admin-login-form" id="admin-login"><div class="admin-error" id="login-error" role="alert">${escapeHtml(message)}</div><label class="admin-login-input"><span class="admin-login-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/></svg></span><input name="email" type="email" autocomplete="username" required placeholder="Work email" aria-label="Work email"></label><label class="admin-login-input password"><input name="password" type="password" autocomplete="current-password" required placeholder="Password" aria-label="Password"><span class="admin-login-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 1 1 8 0v3M12 14v3"/></svg></span></label><button class="admin-login-submit" type="submit">LOGIN</button><p class="admin-login-footnote"><button type="button" class="admin-forgot-link" id="admin-forgot-password">Primary admin password recovery</button><span>Team members: find your invitation email or ask the primary admin to reissue access.</span></p></form></div></section></div><dialog id="admin-reset-dialog" class="security-confirm-dialog"><span class="security-overline">PRIMARY ADMIN RECOVERY</span><h2>Reset administrator password</h2><p>A one-time code will be sent only to the primary administrator’s email. It expires in 10 minutes.</p><div class="security-reset-impact"><b>For the primary administrator only</b><span>Team members cannot reset passwords here. Use the password in your invitation email or ask the primary admin to reissue access. A successful admin reset suspends invited teammates; their profiles remain for re-invitation.</span></div><form id="admin-reset-request"><label class="admin-field">Work email<input name="email" type="email" autocomplete="username" required></label><button class="admin-btn security-primary" type="submit">Send verification code</button></form><form id="admin-reset-complete" hidden><label class="admin-field">Six-digit code<input name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required></label><label class="admin-field">New password<input name="newPassword" type="password" minlength="12" autocomplete="new-password" required></label><label class="admin-field">Confirm new password<input name="confirmation" type="password" minlength="12" autocomplete="new-password" required></label><button class="admin-btn security-primary" type="submit">Reset password</button></form><p id="admin-reset-message" role="status"></p><div class="security-confirm-actions"><button type="button" class="admin-btn ghost" id="admin-reset-close">Close</button></div></dialog></div>`;
  const passwordInput = $('input[name="password"]', root);
  const passwordToggle = document.createElement('button');
  passwordToggle.className = 'admin-login-icon admin-password-toggle';
  passwordToggle.type = 'button';
  passwordToggle.setAttribute('aria-label', 'Show password');
  passwordToggle.setAttribute('aria-pressed', 'false');
  passwordToggle.title = 'Show password';
  passwordToggle.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="2.5"/></svg>';
  $('.admin-login-input.password .admin-login-icon', root).replaceWith(passwordToggle);
  passwordToggle.onclick = () => {
    const show = passwordInput.type === 'password';
    passwordInput.type = show ? 'text' : 'password';
    passwordToggle.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    passwordToggle.setAttribute('aria-pressed', String(show));
    passwordToggle.title = show ? 'Hide password' : 'Show password';
    passwordToggle.innerHTML = show
      ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="2.5"/><path d="m3 3 18 18"/></svg>'
      : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="2.5"/></svg>';
  };
  $('#admin-login').onsubmit = async event => {
    event.preventDefault(); const button = $('button[type="submit"]', event.currentTarget); button.disabled = true; button.textContent = 'VERIFYING…'; $('#login-error').textContent = '';
    let authenticated = false;
    try {
      const data = await api('/api/cms/login', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget))), signal: AbortSignal.timeout(15000) });
      adminUser = data.user; authenticated = true;
      showAdminTransition('Credentials verified. Opening IRONA workspace');
      await loadWorkspace();
    } catch (error) {
      await hideAdminTransition();
      if (authenticated) renderWorkspaceLoadError(error.message);
      else {
        $('#login-error').textContent = adminRequestError(error);
        button.disabled = false; button.textContent = 'LOGIN';
      }
    }
  };
  const resetDialog = $('#admin-reset-dialog');
  const recoveryEmail = $('#admin-reset-request input[name="email"]');
  recoveryEmail.value = 'admin@icl.rw';
  recoveryEmail.readOnly = true;
  recoveryEmail.setAttribute('aria-readonly', 'true');
  $('#admin-forgot-password').onclick = () => { $('#admin-reset-message').textContent = 'A six-digit code will be sent to this address if it matches the primary admin account. The code expires after 10 minutes.'; $('#admin-reset-complete').hidden = true; resetDialog.showModal(); };
  $('#admin-reset-close').onclick = () => resetDialog.close();
  $('#admin-reset-request').onsubmit = async event => {
    event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget)); const message = $('#admin-reset-message');
    try { const result = await api('/api/cms/password-reset/request', { method: 'POST', body: JSON.stringify(values) }); message.textContent = result.message; $('#admin-reset-complete').hidden = false; }
    catch (error) { message.textContent = adminRequestError(error); }
  };
  $('#admin-reset-complete').onsubmit = async event => {
    event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget)); const email = $('#admin-reset-request input[name="email"]').value.trim(); const message = $('#admin-reset-message');
    try { const result = await api('/api/cms/password-reset/complete', { method: 'POST', body: JSON.stringify({ ...values, email }) }); message.textContent = result.message; event.currentTarget.reset(); setTimeout(() => { resetDialog.close(); renderLogin('Password updated. Sign in with your new password.'); }, 1200); }
    catch (error) { message.textContent = adminRequestError(error); }
  };
}
function renderWorkspaceLoadError(message) {
  root.innerHTML = `<section class="admin-workspace-error" role="alert"><img src="/assets/irona-logo.png" alt="IRONA Consultants Ltd"><span>IRONA ADMINISTRATION</span><h1>You’re signed in</h1><p>Your credentials were accepted, but the dashboard could not load its data.</p><div class="admin-workspace-error-detail">${escapeHtml(message || 'Please try again.')}</div><div class="admin-workspace-error-actions"><button class="admin-btn" id="retry-admin-workspace" type="button">Try again</button><button class="admin-btn ghost" id="admin-error-signout" type="button">Sign out</button></div></section>`;
  $('#retry-admin-workspace').onclick = async event => {
    const button = event.currentTarget; button.disabled = true; showAdminTransition('Opening IRONA workspace');
    try { await loadWorkspace(); }
      catch (error) { await hideAdminTransition(); renderWorkspaceLoadError(adminRequestError(error)); }
  };
  $('#admin-error-signout').onclick = async event => {
    const button = event.currentTarget; button.disabled = true;
    try { await api('/api/cms/logout', { method: 'POST' }); adminUser = null; renderLogin(); }
    catch (error) { button.disabled = false; const detail = $('.admin-workspace-error-detail'); if (detail) detail.textContent = error.message; }
  };
}
async function loadWorkspace() {
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 20000);
  let overview, listing, user;
  try { [overview, listing, user] = await Promise.all([api('/api/cms/overview', { signal: controller.signal }), api('/api/cms/content', { signal: controller.signal }), api('/api/cms/me', { signal: controller.signal })]); }
  catch (error) { if (!controller.signal.aborted) controller.abort(); if (controller.signal.aborted && error.name === 'AbortError') { const timeoutError = new Error('The dashboard took too long to load. Check your Atlas connection and retry.'); timeoutError.name = 'TimeoutError'; throw timeoutError; } throw error; }
  finally { clearTimeout(timeout); }
  adminUser = user.user;
  if (adminUser.demo) {
    try { const profile = JSON.parse(localStorage.getItem('irona-admin-profile') || '{}'); adminUser.displayName = profile.name || ''; adminUser.avatarUrl = profile.avatarUrl || ''; } catch { /* Use the account defaults when local profile storage is unavailable. */ }
  }
  contentItems = (listing.content || []).map(normalizeContentItem); renderShell(); renderSection(activeSection, overview); await hideAdminTransition();
}
function renderAdminProfile() {
  const name = adminUser?.displayName || adminUser?.name || 'Administrator';
  const image = $('#admin-profile-image'); const initial = $('#admin-profile-initial');
  $('#admin-profile-name').textContent = name;
  const roleLabels = { administrator: 'Administrator', hr: 'HR', 'content-publisher': 'Content Publisher', 'program-application-manager': 'Program Application Manager' };
  $('.admin-profile-copy small').textContent = adminUser?.primaryAdmin ? 'Primary administrator' : (adminUser?.accessRoles || []).map(role => roleLabels[role]).filter(Boolean).join(' · ') || 'IRONA team member';
  if (adminUser?.avatarUrl) { image.src = adminUser.avatarUrl; image.hidden = false; initial.hidden = true; }
  else { image.removeAttribute('src'); image.hidden = true; initial.hidden = false; initial.textContent = String(name).slice(0, 1).toUpperCase(); }
}
function renderShell() {
  root.innerHTML = `<div class="admin-shell"><aside class="admin-sidebar" id="admin-sidebar"><div class="admin-side-brand"><a href="/" aria-label="IRONA public website"><img src="/assets/irona-logo.png" alt="IRONA Consultants"></a></div><span class="workspace-label">WORKSPACE</span><nav class="admin-nav" aria-label="Admin navigation"><button data-section="overview">${svg('overview')}<span>Overview</span></button>${Object.entries(types).map(([key, meta]) => `<button data-section="${key}">${svg(key)}<span>${meta.label}</span></button>`).join('')}<button data-section="applications">${svg('inbox')}<span>Applications</span></button><button data-section="security">${svg('security')}<span>Security &amp; access</span></button><button data-section="trash">${svg('news')}<span>Trash</span></button></nav><div class="admin-side-bottom"><button class="signout-btn" id="sign-out"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 17l5-5-5-5m5 5H3m9-9h7a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-7"/></svg><span>Sign out</span></button></div></aside><section class="admin-main"><header class="admin-topbar"><div class="admin-top-left"><button class="admin-menu-toggle" id="mobile-menu" aria-label="Open dashboard menu">☰</button><div class="admin-breadcrumb">IRONA workspace <span> / </span> <b id="crumb-label">Overview</b></div></div><div class="admin-top-right"><a href="/">View website ↗</a><div class="admin-profile-wrap"><button class="admin-profile" id="admin-profile-button" type="button" aria-expanded="false" aria-controls="admin-profile-settings"><img id="admin-profile-image" alt="" hidden><span class="admin-profile-initial" id="admin-profile-initial">I</span><span class="admin-profile-copy"><b id="admin-profile-name">Administrator</b><small>Website Admin</small></span><span class="admin-profile-chevron" aria-hidden="true">⌄</span></button><section class="admin-profile-settings" id="admin-profile-settings" hidden><header><div><b>Website admin profile</b><small>Update the name and photo shown here.</small></div><button type="button" id="close-profile-settings" aria-label="Close profile settings">×</button></header><form id="admin-profile-form"><div class="profile-photo-row"><img id="profile-photo-preview" alt="Profile photo preview" hidden><span class="profile-photo-initial" id="profile-photo-initial">I</span><label class="profile-photo-picker">Upload photo<input id="profile-photo-file" type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"></label><button type="button" class="profile-photo-remove" id="remove-profile-photo" hidden>Remove photo</button></div><label class="admin-field">Display name<input id="profile-display-name" name="name" maxlength="80" required></label><button class="admin-btn" type="submit">Save profile</button><div class="form-error" id="profile-error" hidden></div></form></section></div></div></header><main class="admin-content" id="admin-page"></main></section></div><dialog class="admin-confirm-dialog" id="delete-confirm" aria-labelledby="delete-confirm-title" aria-describedby="delete-confirm-copy"><div class="admin-confirm-mark" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6m4-6v6M6 7l1 14h10l1-14M9 7V4h6v3"/></svg></div><span class="eyebrow">CONFIRM REMOVAL</span><h2 id="delete-confirm-title"></h2><p id="delete-confirm-copy"></p><form method="dialog" class="admin-confirm-actions"><button class="admin-btn ghost" value="cancel" autofocus>Keep item</button><button class="admin-btn danger" id="delete-confirm-submit" value="delete">Delete item</button></form></dialog>`;
  $('.admin-breadcrumb').innerHTML = '<b id="crumb-label">Dashboard</b>';
  renderAdminProfile();
  const nav = $('.admin-nav');
  if (!adminUser?.primaryAdmin) nav.querySelector('[data-section="security"]')?.remove();
  $('.admin-top-right').insertAdjacentHTML('beforebegin', `<label class="admin-global-search">${svg('search')}<input id="admin-global-search" type="search" placeholder="Search content or applicants…" aria-label="Search content and applicants"></label>`);
  $$('[data-section]').forEach(button => button.addEventListener('click', async () => { if (!await prepareToLeaveEditor()) return; activeSection = button.dataset.section; editorDirty = false; renderSection(activeSection); $('#admin-sidebar').classList.remove('open'); }));
  $('#sign-out').onclick = async () => {
    const button = $('#sign-out'); button.disabled = true; showAdminTransition('Signing out of IRONA workspace');
    // Keep the opaque transition in place until navigation commits; hiding it first
    // reveals the still-rendered dashboard for a frame on slower machines.
    try { await api('/api/cms/logout', { method: 'POST' }); await waitForAdminTransitionMinimum(); adminUser = null; window.location.replace('/'); }
    catch (error) { await hideAdminTransition(); button.disabled = false; toast(error.message || 'Could not sign out. Please try again.', true); }
  };
  $('#mobile-menu').onclick = () => {
    if (window.matchMedia('(max-width: 760px)').matches) $('#admin-sidebar').classList.toggle('open');
    else $('.admin-shell').classList.toggle('sidebar-collapsed');
  };
  $('#admin-global-search').addEventListener('input', event => {
    const query = event.target.value.trim().toLowerCase();
    const contentSearch = $('#content-search');
    if (contentSearch) { contentSearch.value = query; contentSearch.dispatchEvent(new Event('input')); return; }
    $$('[data-global-search]', $('#admin-page')).forEach(node => { node.hidden = Boolean(query) && !node.textContent.toLowerCase().includes(query); });
  });
  const profilePanel = $('#admin-profile-settings');
  $('#admin-profile-button').onclick = () => {
    const opening = profilePanel.hidden;
    profilePanel.hidden = !opening;
    $('#admin-profile-button').setAttribute('aria-expanded', String(opening));
    if (opening) {
      removeProfilePhoto = false;
      $('#profile-display-name').value = adminUser?.displayName || adminUser?.name || '';
      syncProfilePreview(adminUser?.avatarUrl || '');
      $('#remove-profile-photo').hidden = !adminUser?.avatarUrl;
      $('#profile-error').hidden = true;
    }
  };
  const closeProfile = () => { profilePanel.hidden = true; $('#admin-profile-button').setAttribute('aria-expanded', 'false'); };
  $('#close-profile-settings').onclick = closeProfile;
  document.addEventListener('click', event => { if (!event.target.closest('.admin-profile-wrap')) closeProfile(); });
  $('#profile-photo-file').addEventListener('change', event => {
    const file = event.target.files[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { event.target.value = ''; toast('Choose a JPG, PNG or WebP photo.', true); return; }
    removeProfilePhoto = false; $('#remove-profile-photo').hidden = false;
    syncProfilePreview(URL.createObjectURL(file));
  });
  $('#remove-profile-photo').onclick = () => {
    removeProfilePhoto = true; $('#profile-photo-file').value = ''; $('#remove-profile-photo').hidden = true; syncProfilePreview('');
  };
  $('#admin-profile-form').onsubmit = async event => {
    event.preventDefault();
    const button = $('button[type="submit"]', event.currentTarget); const errorNode = $('#profile-error');
    button.disabled = true; errorNode.hidden = true;
    try {
      const name = $('#profile-display-name').value.trim();
      if (name.length < 2) throw new Error('Enter a name with at least two characters.');
      let avatarUrl = removeProfilePhoto ? '' : adminUser?.avatarUrl || '';
      const photo = $('#profile-photo-file').files[0];
      if (photo) { const form = new FormData(); form.append('file', photo); avatarUrl = adminUser?.demo ? (await api('/api/cms/upload', { method: 'POST', body: form })).url : (await api('/api/cms/profile/photo', { method: 'POST', body: form })).avatarUrl; }
      if (adminUser?.demo) {
        adminUser = { ...adminUser, name, displayName: name, avatarUrl };
        localStorage.setItem('irona-admin-profile', JSON.stringify({ name, avatarUrl }));
      } else {
        adminUser = (await api('/api/cms/me', { method: 'PUT', body: JSON.stringify({ name, removeAvatar: removeProfilePhoto }) })).user;
        adminUser.displayName = adminUser.name;
      }
      renderAdminProfile(); closeProfile(); $('#profile-photo-file').value = ''; toast('Website admin profile saved.');
    } catch (error) { errorNode.textContent = error.message; errorNode.hidden = false; }
    finally { button.disabled = false; }
  };
  $('#delete-confirm').addEventListener('click', event => { if (event.target === event.currentTarget) event.currentTarget.close('cancel'); });
}
function syncProfilePreview(source = '') {
  const image = $('#profile-photo-preview'); const initial = $('#profile-photo-initial');
  const name = $('#profile-display-name').value.trim() || adminUser?.displayName || adminUser?.name || 'A';
  if (source) { image.src = source; image.hidden = false; initial.hidden = true; }
  else { image.removeAttribute('src'); image.hidden = true; initial.hidden = false; initial.textContent = String(name).slice(0, 1).toUpperCase(); }
}
function confirmContentDelete(item) {
  const dialog = $('#delete-confirm');
  const type = types[item.type]?.singular || item.type || 'item';
  $('#delete-confirm-title').textContent = `Delete this ${type}?`;
  $('#delete-confirm-copy').textContent = String.fromCharCode(34) + item.title + String.fromCharCode(34) + ' will move to Trash. You can restore it later.';
  $('#delete-confirm-submit').textContent = 'Move to Trash';
  return new Promise(resolve => {
    dialog.addEventListener('close', () => resolve(dialog.returnValue === 'delete'), { once: true });
    dialog.showModal();
  });
}
function confirmPermanentlyDelete(item) {
  const dialog = $('#delete-confirm');
  $('#delete-confirm-title').textContent = 'Delete this item forever?';
  $('#delete-confirm-copy').textContent = String.fromCharCode(34) + item.title + String.fromCharCode(34) + ' will be permanently deleted and cannot be restored.';
  $('#delete-confirm-submit').textContent = 'Delete forever';
  return new Promise(resolve => {
    dialog.addEventListener('close', () => resolve(dialog.returnValue === 'delete'), { once: true });
    dialog.showModal();
  });
}
function confirmSubmissionDelete(kind, title) {
  const dialog = $('#delete-confirm');
  const isApplication = kind === 'application';
  $('#delete-confirm-title').textContent = isApplication ? 'Permanently delete this application?' : 'Permanently delete this registration?';
  $('#delete-confirm-copy').textContent = isApplication
    ? 'The submission from "' + title + '" and its uploaded documents will be permanently removed. This cannot be undone.'
    : 'The registration from "' + title + '" will be permanently removed. This cannot be undone.';
  $('#delete-confirm-submit').textContent = 'Delete permanently';
  return new Promise(resolve => {
    dialog.addEventListener('close', () => resolve(dialog.returnValue === 'delete'), { once: true });
    dialog.showModal();
  });
}

function heading(title, description, action = '') { return `<div class="page-heading"><div><span class="eyebrow">IRONA PUBLISHING</span><h1>${title}</h1><p>${description}</p></div>${action ? `<div class="heading-actions">${action}</div>` : ''}</div>`; }
function metric(label, value, caption, icon) { return `<article class="metric-card metric-${icon}"><div class="metric-top"><span>${label}</span><span class="metric-icon">${svg(icon)}</span></div><div class="metric-value">${Number(value) || 0}</div><div class="metric-caption">${caption}</div></article>`; }
function animateMetricValues() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  $$('.metric-value', $('#admin-page')).forEach(node => {
    const target = Number(node.textContent) || 0;
    if (!target) return;
    const start = performance.now(); const duration = 620;
    node.textContent = '0';
    const tick = now => {
      const progress = Math.min(1, (now - start) / duration);
      node.textContent = String(Math.round(target * (1 - (1 - progress) ** 3)));
      if (progress < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}
function renderSection(section, stats = null) {
  activeSection = section;
  try { sessionStorage.setItem('irona-admin-active-section', section); } catch { /* Keep navigation usable when browser storage is unavailable. */ }
  if ($('#admin-global-search')) $('#admin-global-search').value = '';
  $$('[data-section]').forEach(button => button.classList.toggle('active', button.dataset.section === section));
  const labels = { overview: 'Dashboard', applications: 'Applications', security: 'Security & access', trash: 'Trash', ...Object.fromEntries(Object.entries(types).map(([key, meta]) => [key, meta.label])) };
  $('#crumb-label').textContent = labels[section] || 'Overview';
  const permissions = adminUser?.permissions || [];
  const can = permission => permissions.includes('*') || permissions.includes(permission);
  const required = { vacancy: 'vacancies.manage', program: 'programs.manage', publication: 'content.manage', event: 'content.manage' }[section];
  const allowed = section === 'overview' || (section === 'security' ? Boolean(adminUser?.primaryAdmin) : section === 'applications' ? ['applications.manage', 'applications.vacancies', 'applications.programs'].some(can) : section === 'trash' ? ['content.manage', 'vacancies.manage', 'programs.manage'].some(can) : !required || can(required));
  if (!allowed) {
    $('#admin-page').innerHTML = heading(labels[section] || 'Workspace', 'This section is visible in the workspace menu, with access controlled by your assigned role.') + '<section class="empty-panel"><h2>Access not assigned</h2><p>Your account does not have permission to view or manage this section. Ask the primary administrator to update your access roles.</p></section>';
    return;
  }
  if (section === 'overview') { renderOverview(stats); return; }
  if (section === 'applications') { renderApplications(); return; }
  if (section === 'security') { renderSecurityAccess(); return; }
  if (section === 'trash') { renderTrash(); return; }
  renderLibrary(section);
}
function renderSecurityAccess() {
  const email = escapeHtml(adminUser?.email || 'Administrator account');
  $('#admin-page').innerHTML = heading('Security & access', 'Manage teammate access and protect your administrator account.') + `
    <div class="security-preview-notice"><span class="security-notice-mark">✓</span><div><b>Primary administrator controls</b><p>Invite colleagues with role-based access. Invitation passwords are securely hashed and expire after 48 hours if unused.</p></div></div>
    <div class="security-tabs" role="tablist" aria-label="Security settings"><button class="active" type="button" role="tab" aria-selected="true" data-security-tab="team">Team access</button><button type="button" role="tab" aria-selected="false" data-security-tab="account">My security</button></div>
    <section class="security-tab-panel active" data-security-panel="team" role="tabpanel">
      <div class="security-grid">
        <article class="security-card security-invite-card"><div class="security-card-heading"><div><span class="security-overline">TEAM MANAGEMENT</span><h2>Invite a teammate</h2><p>Send a secure sign-in code and assign one or more access roles.</p></div><span class="security-card-icon">${svg('plus')}</span></div>
          <form id="security-invite-form" class="security-form"><label class="admin-field">Work email<input id="security-invite-email" name="email" type="email" placeholder="name@icl.rw" autocomplete="off" required><small>A 12-digit password is emailed and can be used for 48 hours to activate the account.</small></label><div class="security-role-field"><span>Access roles</span><details class="security-role-dropdown" id="security-invite-roles"><summary><span data-role-summary>Select one or more roles</span><span class="security-role-chevron" aria-hidden="true">⌄</span></summary><div class="security-role-dropdown-menu"><label><input type="checkbox" name="accessRoles" value="administrator"><span><b>Administrator</b><small>Manage workspace content and applications</small></span></label><label><input type="checkbox" name="accessRoles" value="hr"><span><b>HR</b><small>Manage vacancies and vacancy applications</small></span></label><label><input type="checkbox" name="accessRoles" value="content-publisher"><span><b>Content Publisher</b><small>Publish news, insights and events</small></span></label><label><input type="checkbox" name="accessRoles" value="program-application-manager"><span><b>Program Application Manager</b><small>Manage programs and program applications</small></span></label></div></details></div><button class="admin-btn security-primary" type="submit">Review invitation <span aria-hidden="true">→</span></button></form>
        </article>
        <article class="security-card security-process-card"><span class="security-overline">ACCESS ROLES</span><h2>Permissions stay with the server</h2><p>Each role grants only the tools required for its work. A teammate can hold several roles. Security settings, invitations and account suspension remain exclusive to the primary administrator.</p><div class="security-policy-row"><span class="security-policy-check">✓</span><span>Changing the primary admin password suspends invited accounts and expires their sign-in credentials.</span></div></article>
        <article class="security-card security-directory-card"><div class="security-card-heading"><div><span class="security-overline">TEAM DIRECTORY</span><h2>Team accounts</h2></div><button class="admin-btn ghost" id="security-team-refresh" type="button">Refresh</button></div><p>Profiles and role assignments are stored in the IRONA database. Suspended accounts stay listed and can be invited again.</p><div id="security-team-list" class="security-empty">Loading team…</div></article>
        <article class="security-card security-policy-card"><span class="security-overline">ACCOUNT STATUS</span><h2>Invitation lifecycle</h2><div class="security-policy-row"><span class="security-policy-check">1</span><span>Invited: temporary sign-in password is valid for 48 hours.</span></div><div class="security-policy-row"><span class="security-policy-check">2</span><span>Active: teammate has signed in; profile and access roles remain saved.</span></div><div class="security-policy-row"><span class="security-policy-check">3</span><span>Suspended: access is revoked, profile is retained, and the primary admin can resend a fresh invitation.</span></div></article>
      </div>
    </section>
    <section class="security-tab-panel" data-security-panel="account" role="tabpanel" hidden>
      <div class="security-grid security-account-grid security-account-single"><article class="security-card"><span class="security-overline">PRIMARY ADMIN</span><h2>Change your password</h2><div class="security-account-email"><span class="security-account-avatar">${escapeHtml((adminUser?.name || 'A').slice(0,1).toUpperCase())}</span><div><b>${escapeHtml(adminUser?.name || 'Administrator')}</b><small>${email}</small></div></div><form id="security-password-form" class="security-form"><label class="admin-field">Current password<input name="currentPassword" type="password" autocomplete="current-password" placeholder="Enter current password" required></label><label class="admin-field">New password<input name="newPassword" type="password" autocomplete="new-password" placeholder="At least 12 characters" minlength="12" required></label><label class="admin-field">Confirm new password<input name="confirmation" type="password" autocomplete="new-password" placeholder="Enter new password again" minlength="12" required></label><button class="admin-btn security-primary" type="submit">Save new password</button><p class="security-form-note">Changing your password suspends invited teammates. Their profiles remain listed so you can resend access with new credentials.</p></form></article></div>
    </section>
    <dialog class="security-confirm-dialog" id="security-invite-confirm" aria-labelledby="security-confirm-title"><span class="security-overline">REVIEW ACCESS</span><h2 id="security-confirm-title">Send this invitation?</h2><p>A temporary 12-digit sign-in password will be emailed to this address. It expires in 48 hours if unused.</p><div class="security-confirm-summary"><small>TEAM MEMBER</small><b id="security-confirm-email"></b><small>ACCESS ROLES</small><b id="security-confirm-roles"></b></div><div class="security-confirm-warning">The invitation email includes the IRONA sign-in link and temporary password. Use it within 48 hours.</div><div class="security-confirm-actions"><button class="admin-btn ghost" type="button" id="security-confirm-cancel">Go back</button><button class="admin-btn security-primary" type="button" id="security-confirm-send">Send invitation</button></div></dialog>
    <dialog class="security-confirm-dialog" id="security-action-confirm" aria-labelledby="security-action-title"><span class="security-overline" id="security-action-eyebrow">CONFIRM ACCESS</span><h2 id="security-action-title">Confirm this action?</h2><p id="security-action-copy"></p><div class="security-confirm-actions"><button class="admin-btn ghost" type="button" id="security-action-cancel">Go back</button><button class="admin-btn security-primary" type="button" id="security-action-accept">Continue</button></div></dialog>`;
  $$('[data-security-tab]').forEach(button => button.addEventListener('click', () => {
    $$('[data-security-tab]').forEach(tab => { const active = tab === button; tab.classList.toggle('active', active); tab.setAttribute('aria-selected', String(active)); });
    $$('[data-security-panel]').forEach(panel => { const active = panel.dataset.securityPanel === button.dataset.securityTab; panel.hidden = !active; panel.classList.toggle('active', active); });
  }));
  const inviteDialog = $('#security-invite-confirm');
  const actionDialog = $('#security-action-confirm');
  const confirmAction = ({ title, message, confirmLabel, eyebrow = 'CONFIRM ACCESS' }) => new Promise(resolve => {
    $('#security-action-eyebrow').textContent = eyebrow;
    $('#security-action-title').textContent = title;
    $('#security-action-copy').textContent = message;
    $('#security-action-accept').textContent = confirmLabel;
    actionDialog.onclose = () => resolve(actionDialog.returnValue === 'confirm');
    actionDialog.returnValue = 'cancel';
    actionDialog.showModal();
  });
  $('#security-action-cancel').onclick = () => actionDialog.close('cancel');
  $('#security-action-accept').onclick = () => actionDialog.close('confirm');
  $('#security-invite-roles').addEventListener('change', () => {
    const selected = [...$('#security-invite-roles').querySelectorAll('input:checked')].map(input => input.parentElement.querySelector('b').textContent);
    $('#security-invite-roles [data-role-summary]').textContent = selected.length ? `${selected.length} role${selected.length === 1 ? '' : 's'} selected: ${selected.join(', ')}` : 'Select one or more roles';
  });
  $('#security-invite-form').onsubmit = event => { event.preventDefault(); if (!event.currentTarget.reportValidity()) return; const accessRoles = new FormData(event.currentTarget).getAll('accessRoles'); if (!accessRoles.length) { toast('Select at least one access role.', true); return; } $('#security-confirm-email').textContent = $('#security-invite-email').value.trim(); $('#security-confirm-roles').textContent = accessRoles.map(role => ({ administrator: 'Administrator', hr: 'HR', 'content-publisher': 'Content Publisher', 'program-application-manager': 'Program Application Manager' })[role]).join(' · '); inviteDialog.showModal(); };
  $('#security-confirm-cancel').onclick = () => inviteDialog.close();
  $('#security-confirm-send').onclick = async () => {
    const button = $('#security-confirm-send'); button.disabled = true; button.textContent = 'Sending…';
    try { const values = new FormData($('#security-invite-form')); const result = await api('/api/cms/invitations', { method: 'POST', body: JSON.stringify({ email: values.get('email').trim(), accessRoles: values.getAll('accessRoles') }) }); inviteDialog.close(); $('#security-invite-form').reset(); $('#security-invite-roles').open = false; $('#security-invite-roles [data-role-summary]').textContent = 'Select one or more roles'; toast(result.message); await loadSecurityTeam(); }
    catch (error) { toast(adminRequestError(error), true); }
    finally { button.disabled = false; button.textContent = 'Send invitation'; }
  };
  $('#security-password-form').onsubmit = async event => { event.preventDefault(); if (!await confirmAction({ eyebrow: 'PRIMARY ADMIN SECURITY', title: 'Change your password?', message: 'All invited teammates will be suspended and their current sign-in passwords invalidated. Their profiles will remain available for re-invitation.', confirmLabel: 'Change password' })) return; const values = Object.fromEntries(new FormData(event.currentTarget)); try { const result = await api('/api/cms/password/change', { method: 'POST', body: JSON.stringify(values) }); toast(result.message); event.currentTarget.reset(); await loadSecurityTeam(); } catch (error) { toast(adminRequestError(error), true); } };
  $('#security-team-refresh').onclick = loadSecurityTeam;
  $('#security-team-list').addEventListener('click', async event => {
    const resend = event.target.closest('[data-team-resend]');
    const suspend = event.target.closest('[data-team-suspend]');
    if (resend) {
      const email = resend.dataset.teamResend;
      if (!await confirmAction({ eyebrow: 'REISSUE TEAM ACCESS', title: 'Send a new sign-in password?', message: `A fresh 12-digit password will be emailed to ${email}. It is valid for 48 hours, and any current password for this account will stop working.`, confirmLabel: 'Send new password' })) return;
      resend.disabled = true;
      try { const result = await api('/api/cms/invitations', { method: 'POST', body: JSON.stringify({ email, accessRoles: resend.dataset.teamRoles.split(',').filter(Boolean) }) }); toast(result.message); await loadSecurityTeam(); }
      catch (error) { toast(adminRequestError(error), true); resend.disabled = false; }
    }
    if (suspend) {
      const id = suspend.dataset.teamSuspend;
      if (!await confirmAction({ eyebrow: 'SUSPEND TEAM ACCESS', title: 'Suspend this teammate?', message: 'They will no longer be able to sign in. Their profile and role history remain in the directory, and you can reissue access later.', confirmLabel: 'Suspend access' })) return;
      suspend.disabled = true;
      try { const result = await api(`/api/cms/users/${encodeURIComponent(id)}/suspend`, { method: 'POST' }); toast(result.message); await loadSecurityTeam(); }
      catch (error) { toast(adminRequestError(error), true); suspend.disabled = false; }
    }
  });
  $('#security-team-list').addEventListener('submit', async event => {
    const form = event.target.closest('[data-team-access]'); if (!form) return;
    event.preventDefault(); const accessRoles = new FormData(form).getAll('accessRoles');
    if (!accessRoles.length) { toast('Select at least one access role.', true); return; }
    try { const result = await api(`/api/cms/users/${encodeURIComponent(form.dataset.teamAccess)}/access`, { method: 'PUT', body: JSON.stringify({ accessRoles }) }); toast(result.message); await loadSecurityTeam(); }
    catch (error) { toast(adminRequestError(error), true); }
  });
  loadSecurityTeam();
}
async function loadSecurityTeam() {
  const target = $('#security-team-list'); if (!target) return;
  try {
    const data = await api('/api/cms/users');
    const roleLabels = { administrator: 'Administrator', hr: 'HR', 'content-publisher': 'Content Publisher', 'program-application-manager': 'Program Application Manager' };
    const roles = Object.keys(roleLabels);
    const accounts = (data.users || []).map(user => {
      const assignedRoles = user.accessRoles?.length ? user.accessRoles : (user.role === 'admin' && !user.primaryAdmin ? ['administrator'] : []);
      const accessStatus = user.accessStatus === 'invited' && user.credentialExpiresAt && new Date(user.credentialExpiresAt).getTime() <= Date.now() ? 'expired' : (user.accessStatus || 'active');
      const statusLabel = ({ active: 'Active', invited: 'Invitation sent', expired: 'Invitation expired', suspended: 'Access suspended' })[accessStatus] || 'Active';
      const assigned = user.primaryAdmin ? ['Primary administrator'] : assignedRoles.map(role => roleLabels[role]).filter(Boolean);
      const avatar = user.avatarUrl ? `<img class="security-team-avatar" src="${escapeHtml(user.avatarUrl)}" alt="">` : `<span class="security-team-avatar security-team-initial">${escapeHtml((user.name || user.email || '?').slice(0,1).toUpperCase())}</span>`;
      const roleEditor = user.primaryAdmin ? '' : `<details class="security-team-roles"><summary>Edit roles <span aria-hidden="true">⌄</span></summary><form data-team-access="${escapeHtml(user.id)}"><p>Choose one or more roles</p>${roles.map(role => `<label><input type="checkbox" name="accessRoles" value="${role}" ${assignedRoles.includes(role) ? 'checked' : ''}><span>${roleLabels[role]}</span></label>`).join('')}<button class="admin-btn security-primary" type="submit">Save roles</button></form></details>`;
      const actions = user.primaryAdmin ? '<small class="security-primary-label">Primary admin</small>' : `<button class="admin-btn ghost" type="button" data-team-resend="${escapeHtml(user.email)}" data-team-roles="${escapeHtml(assignedRoles.join(','))}">${accessStatus === 'active' ? 'Rotate sign-in code' : 'Resend invitation'}</button>${accessStatus !== 'suspended' ? `<button class="admin-btn ghost security-suspend" type="button" data-team-suspend="${escapeHtml(user.id)}">Suspend</button>` : ''}${roleEditor}`;
      return `<article class="security-team-row"><div class="security-team-person">${avatar}<div><b>${escapeHtml(user.name || 'Profile not completed')}</b><span>${escapeHtml(user.email)}</span><small>${escapeHtml(assigned.join(' · ') || 'No roles assigned')}</small></div></div><span class="security-team-status status-${accessStatus}">${statusLabel}</span><div class="security-team-actions">${actions}</div></article>`;
    });
    target.className = accounts.length ? 'security-directory-list' : 'security-empty';
    target.innerHTML = accounts.join('') || '<b>No team accounts yet</b><p>Invited colleagues and their saved profiles will appear here.</p>';
  } catch (error) { target.textContent = adminRequestError(error); }
}async function renderApplications(contentId = '', contentType = 'all') {
  const permissions = adminUser?.permissions || [];
  const can = permission => permissions.includes('*') || permissions.includes(permission);
  const canViewPrograms = can('applications.manage') || can('applications.programs') || can('programs.manage');
  const canViewVacancies = can('applications.manage') || can('applications.vacancies') || can('vacancies.manage');
  if (contentId && contentType === 'all') {
    contentType = contentItems.find(item => item.id === contentId)?.type || 'all';
  }
  $('#admin-page').innerHTML = heading('Applications', 'Review submissions for IRONA vacancies and programs.') + '<div class="applications-loading">Loading applications...</div>';
  try {
    const [data, registrationData] = await Promise.all([api('/api/cms/applications'), canViewPrograms ? api('/api/cms/program-registrations') : Promise.resolve({ registrations: [] })]);
    const applications = data.applications || [];
    const registrations = registrationData.registrations || [];
    const opportunities = contentItems.filter(item => item.type === 'program' ? canViewPrograms : item.type === 'vacancy' && canViewVacancies);
    const allSubmissions = [...applications, ...registrations];
    const programItems = contentItems.filter(item => item.type === 'program' && itemStatus(item) === 'published');
    const openPrograms = programItems.filter(item => (!item.opensAt || new Date(item.opensAt).getTime() <= Date.now()) && (!item.closesAt || new Date(item.closesAt).getTime() >= Date.now())).length;
    const upcomingPrograms = programItems.filter(item => item.opensAt && new Date(item.opensAt).getTime() > Date.now()).length;
    const programApplicationCount = applications.filter(item => item.contentType === 'program').length;
    const applicationOverview = canViewPrograms ? `<section class="metric-grid program-applications-overview">${metric('Program registrations', registrations.length, 'Contact details received', 'inbox')}${metric('Website program applications', programApplicationCount, 'Internal form submissions only', 'program')}${metric('Open programs', openPrograms, 'Accepting registrations', 'vacancy')}${metric('Upcoming programs', upcomingPrograms, 'Opening later', 'clock')}</section>` : '';
    const allowedTypes = [...(canViewPrograms ? [['program', 'Programs']] : []), ...(canViewVacancies ? [['vacancy', 'Vacancies']] : [])];
    if (!allowedTypes.some(([type]) => type === contentType)) contentType = 'all';
    const filter = `<div class="applications-filter-bar"><div class="application-type-filters" role="group" aria-label="Filter submissions by type">${[['all', 'All'], ...allowedTypes].map(([value, label]) => `<button type="button" class="application-type-filter ${contentType === value ? 'active' : ''}" data-type-filter="${value}" aria-pressed="${contentType === value}">${label}</button>`).join('')}</div><label class="application-filter">Filter by opportunity<select id="application-content-filter"><option value="all" ${!contentId && contentType === 'all' ? 'selected' : ''}>All available submissions</option>${allowedTypes.map(([type, label]) => `<option value="${type}" ${!contentId && contentType === type ? 'selected' : ''}>All ${label.toLowerCase()}</option>`).join('')}${opportunities.map(item => `<option value="item:${escapeHtml(item.id)}" ${item.id === contentId ? 'selected' : ''}>${escapeHtml(item.type === 'program' ? 'Program: ' : 'Vacancy: ')}${escapeHtml(item.title)}</option>`).join('')}</select></label><span class="application-filter-count" id="application-filter-count" aria-live="polite"></span></div>`;
    const cards = applications.length ? `<div class="application-admin-list">${applications.map(item => {
      const title = item.contentTitle || item.vacancyTitle || 'IRONA opportunity';
      const typeLabel = item.contentType === 'program' ? 'Program application' : 'Vacancy application';
      const answers = item.answers && typeof item.answers === 'object' ? item.answers : {};
      const contactRows = [
        ['Full name', item.name], ['Email address', item.email], ['Telephone number', item.phone], ['Current location', item.location],
      ].filter(([, value]) => String(value || '').trim());
      const detailRows = rows => rows.filter(([, value]) => String(value || '').trim()).map(([label, value]) => `<div class="application-data-row"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join('');
      const contactMarkup = `<section class="application-detail-section"><h3>Applicant details</h3><dl class="application-data-list">${detailRows(contactRows)}</dl></section>`;
      const monthLabel = value => {
        const match = /^(\d{4})-(\d{2})$/.exec(String(value || ''));
        return match ? new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1))) : value;
      };
      const education = Array.isArray(item.educationHistory) ? item.educationHistory.filter(row => Object.values(row || {}).some(value => Boolean(value))) : [];
      const work = Array.isArray(item.workHistory) ? item.workHistory.filter(row => Object.values(row || {}).some(value => Boolean(value))) : [];
      const educationMarkup = education.map((row, index) => {
        const fields = [['Qualification level', row.level], ['Qualification / subject', row.qualification], ['Institution', row.institution], ['Faculty, school or department', row.faculty], ['Start date', monthLabel(row.startDate)], ['End date', row.current ? 'Currently studying' : monthLabel(row.endDate)]];
        return `<article class="application-history-record"><h4>Education ${index + 1}</h4><dl class="application-data-list">${detailRows(fields)}</dl></article>`;
      }).join('');
      const workMarkup = work.map((row, index) => {
        const fields = [['Employer', row.employer], ['Role / job title', row.role], ['Start date', monthLabel(row.startDate)], ['End date', row.current ? 'Currently working' : monthLabel(row.endDate)], ['Main responsibilities', row.responsibilities]];
        return `<article class="application-history-record"><h4>Experience ${index + 1}</h4><dl class="application-data-list">${detailRows(fields)}</dl></article>`;
      }).join('');
      const historyMarkup = educationMarkup || workMarkup ? `<section class="application-detail-section application-history-admin"><h3>Education &amp; qualifications</h3>${educationMarkup || '<p class="application-detail-empty">No education details provided.</p>'}<h3>Work experience</h3>${workMarkup || '<p class="application-detail-empty">No experience details provided.</p>'}</section>` : '';
      const hiddenLabels = new Set(['full name', 'email address', 'telephone number', 'current location']);
      const opportunity = contentItems.find(candidate => candidate.id === (item.contentId || item.vacancyId));
      const questionLabels = new Map((opportunity?.applicationQuestions || []).map(question => [String(question.id), question.label]));
      const responseRows = Object.entries(answers).map(([id, value]) => [questionLabels.get(id) || id, value]).filter(([label, value]) => !hiddenLabels.has(String(label).toLowerCase()) && String(value || '').trim());
      if (!responseRows.some(([label]) => /cover letter|motivation/i.test(label)) && String(item.coverLetter || '').trim()) responseRows.push(['Cover letter / motivation', item.coverLetter]);
      const responseMarkup = responseRows.length ? `<section class="application-detail-section"><h3>Role responses</h3><dl class="application-data-list">${detailRows(responseRows)}</dl></section>` : '';
      const files = [...(item.cv ? [{ ...item.cv, label: 'CV / resume' }] : []), ...(item.documents || [])].map(file => ({ ...file, mime: file.mime || (/\.pdf$/i.test(file.originalName || '') ? 'application/pdf' : '') }));
      const fileMarkup = files.length ? `<section class="application-detail-section"><h3>Documents</h3>${files.map((file, index) => `<article class="application-file-row"><div><b>${escapeHtml(file.label || file.originalName)}</b><p>${escapeHtml(file.originalName)} &middot; ${Math.max(1, Math.ceil((Number(file.size) || 0) / 1024))} KB</p></div><div class="application-file-actions">${file.mime === 'application/pdf' ? `<a class="icon-btn" href="/api/cms/applications/${encodeURIComponent(item.id)}/files/${index}?inline=1" target="_blank" rel="noopener noreferrer">Preview PDF</a>` : ''}<a class="icon-btn" href="/api/cms/applications/${encodeURIComponent(item.id)}/files/${index}">Download</a></div></article>`).join('')}</section>` : '<section class="application-detail-section"><h3>Documents</h3><p class="application-detail-empty">No documents attached.</p></section>';
      const kind = item.contentType === 'program' ? 'program' : 'vacancy';
      return `<article class="application-admin-card" id="submission-${escapeHtml(item.id)}" data-submission-kind="${kind}" data-opportunity-id="${escapeHtml(item.contentId || item.vacancyId || '')}" data-global-search><header><div class="application-admin-heading"><span class="eyebrow">${escapeHtml(typeLabel)} &middot; ${escapeHtml(title)}</span><h2>${escapeHtml(item.name)}</h2><p>Submitted ${escapeHtml(dateLabel(item.submittedAt))} <span class="application-status-chip">${escapeHtml(item.status || 'Received')}</span>${item.reference ? ` <span class="application-reference-inline">Ref ${escapeHtml(item.reference)}</span>` : ''}</p></div><div class="application-admin-header-actions"><span class="application-admin-contact"><a href="mailto:${escapeHtml(item.email)}">${escapeHtml(item.email)}</a><a href="tel:${escapeHtml(item.phone)}">${escapeHtml(item.phone)}</a></span><button class="application-delete-button" type="button" data-delete-application="${escapeHtml(item.id)}" aria-label="Delete application from ${escapeHtml(item.name)}" title="Delete application"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6m4-6v6M6 7l1 14h10l1-14M9 7V4h6v3"/></svg></button></div></header><details><summary><span>Review submission</span><span class="application-detail-summary-hint">Answers, history and uploaded documents</span></summary><div class="application-admin-details">${contactMarkup}${historyMarkup}${responseMarkup}${fileMarkup}</div></details></article>`;
    }).join('')}</div>` : `<div class="empty-panel"><span class="empty-panel-mark">${svg('inbox')}</span><h2>No applications received yet</h2><p>Website applications for published vacancies and programs will appear here with the applicant&#8217;s answers and submitted documents.</p></div>`;
    const registrationRows = registrations.length ? `<div class="program-registration-table-wrap"><table class="program-registration-table"><thead><tr><th>Program</th><th>Applicant</th><th>Contact</th><th>Progress</th><th>Registered</th><th><span class="sr-only">Actions</span></th></tr></thead><tbody>${registrations.map(item => {
      const linked = applications.find(application => application.contentType === 'program' && application.contentId === item.programId && String(application.email || '').trim().toLowerCase() === String(item.email || '').trim().toLowerCase());
      const progress = linked ? `<a class="registration-stage complete" href="#submission-${encodeURIComponent(linked.id)}">Full application received</a>` : '<span class="registration-stage">Registration received</span><small class="registration-stage-note">Full form is completed externally and is not synced here.</small>';
      return `<tr data-submission-kind="program" data-opportunity-id="${escapeHtml(item.programId)}" data-global-search><td data-label="Program">${escapeHtml(item.programTitle || opportunities.find(program => program.id === item.programId)?.title || 'Program')}</td><td data-label="Applicant">${escapeHtml(item.name)}</td><td data-label="Contact"><a href="mailto:${escapeHtml(item.email)}">${escapeHtml(item.email)}</a><a href="tel:${escapeHtml(item.phone)}">${escapeHtml(item.phone)}</a></td><td data-label="Progress">${progress}</td><td data-label="Registered">${escapeHtml(dateLabel(item.submittedAt))}</td><td data-label="Actions"><button class="application-delete-button small" type="button" data-delete-registration="${escapeHtml(item.id)}" aria-label="Delete registration from ${escapeHtml(item.name)}" title="Delete registration"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6m4-6v6M6 7l1 14h10l1-14M9 7V4h6v3"/></svg></button></td></tr>`;
    }).join('')}</tbody></table></div>` : '<div class="empty-panel"><h2>No program registrations yet</h2><p>Contact details submitted on the IRONA website will appear here. Program applications completed through an external form are not imported into this workspace.</p></div>';
    const registrationSection = canViewPrograms ? `<section class="program-registration-section" data-submission-section="program"><div class="section-heading"><div><span class="eyebrow">PROGRAMS</span><h2>Program registrations</h2><p id="program-registration-count">${registrations.length} registration${registrations.length === 1 ? '' : 's'} received. The detailed application is completed in the program's external form.</p></div></div>${registrationRows}</section>` : '';
    const applicationsHeading = contentType === 'program' ? 'Program applications' : contentType === 'vacancy' ? 'Vacancy applications' : 'Applications';
    const applicationTypeLabel = contentType === 'all' ? 'PROGRAMS AND VACANCIES' : contentType === 'program' ? 'PROGRAMS' : 'VACANCIES';
    const applicationsSection = `<section class="legacy-opportunity-applications" data-submission-section="applications"><div class="section-heading"><div><span class="eyebrow" id="applications-section-label">${applicationTypeLabel}</span><h2 id="applications-section-heading">${applicationsHeading}</h2></div></div>${cards}</section>`;
    const emptyFilterTitle = allSubmissions.length ? 'No matching submissions' : 'No applications or registrations yet';
    const emptyFilterCopy = allSubmissions.length ? 'Choose another filter to see applications and registrations.' : 'Program registrations and website applications will appear here when people submit them.';
    const submissionsSummary = allSubmissions.length === 1 ? '1 application or registration received.' : `${allSubmissions.length} applications and registrations received.`;
    $('#admin-page').innerHTML = heading('Applications', submissionsSummary) + applicationOverview + `<div class="applications-toolbar">${filter}</div><div class="empty-panel application-filter-empty" id="application-no-results" hidden><h2>${emptyFilterTitle}</h2><p>${emptyFilterCopy}</p></div>${registrationSection}${applicationsSection}`;
    const opportunityFilter = $('#application-content-filter');
    let selectedType = contentType;
    let selectedId = contentId;
    const applyFilters = () => {
      const visible = [...$$('[data-submission-kind]')].filter(element => {
        const matchesType = selectedType === 'all' || element.dataset.submissionKind === selectedType;
        const matchesId = !selectedId || element.dataset.opportunityId === selectedId;
        const show = matchesType && matchesId;
        element.hidden = !show;
        return show;
      }).length;
      const visibleRegistrations = $$('[data-submission-kind="program"]:not([hidden])').filter(element => element.matches('tr')).length;
      $$('[data-submission-section]').forEach(section => { section.hidden = ![...section.querySelectorAll('[data-submission-kind]')].some(element => !element.hidden); });
      $('#application-filter-count').textContent = `${visible} ${visible === 1 ? 'result' : 'results'}`;
      $('#application-no-results').hidden = visible > 0;
      const registrationCount = $('#program-registration-count');
      if (registrationCount) registrationCount.textContent = `${visibleRegistrations} registration${visibleRegistrations === 1 ? '' : 's'} shown`;
      const appLabel = $('#applications-section-label');
      const appHeading = $('#applications-section-heading');
      if (appLabel) appLabel.textContent = selectedType === 'program' ? 'PROGRAM APPLICATIONS' : selectedType === 'vacancy' ? 'VACANCY APPLICATIONS' : 'PROGRAMS AND VACANCIES';
      if (appHeading) appHeading.textContent = selectedType === 'program' ? 'Program applications' : selectedType === 'vacancy' ? 'Vacancy applications' : 'Applications';
      $$('[data-type-filter]').forEach(button => { const active = button.dataset.typeFilter === selectedType; button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active)); });
    };
    opportunityFilter.onchange = event => {
      const value = event.target.value;
      const item = value.startsWith('item:') ? opportunities.find(opportunity => opportunity.id === value.slice(5)) : null;
      selectedId = item?.id || '';
      selectedType = item?.type || (['program', 'vacancy'].includes(value) ? value : 'all');
      applyFilters();
    };
    $$('[data-type-filter]').forEach(button => button.onclick = () => { selectedType = button.dataset.typeFilter; selectedId = ''; opportunityFilter.value = selectedType; applyFilters(); });
    applyFilters();
    $$('[data-delete-application]').forEach(button => button.onclick = async () => {
      const application = applications.find(item => item.id === button.dataset.deleteApplication);
      if (!application || !await confirmSubmissionDelete('application', `${application.name} - ${application.contentTitle || application.vacancyTitle || 'IRONA opportunity'}`)) return;
      try { await api(`/api/cms/applications/${encodeURIComponent(application.id)}`, { method: 'DELETE' }); toast('Application and its uploaded documents were deleted.'); await renderApplications(selectedId, selectedType); }
      catch (error) { toast(error.message, true); }
    });
    $$('[data-delete-registration]').forEach(button => button.onclick = async () => {
      const registration = registrations.find(item => item.id === button.dataset.deleteRegistration);
      if (!registration || !await confirmSubmissionDelete('registration', `${registration.name} - ${registration.programTitle || 'Program'}`)) return;
      try { await api(`/api/cms/program-registrations/${encodeURIComponent(registration.id)}`, { method: 'DELETE' }); toast('Program registration deleted.'); await renderApplications(selectedId, selectedType); }
      catch (error) { toast(error.message, true); }
    });
  } catch (error) { $('#admin-page').innerHTML = heading('Applications', 'Review submissions received through the IRONA website.') + `<div class="empty-panel"><h2>Applications could not be loaded</h2><p>${escapeHtml(error.message)}</p></div>`; }
}
function normalizeContentItem(item) { return item.type === 'news' ? { ...item, type: 'publication', category: item.category || 'Story' } : item; }
async function refreshContent() { const data = await api('/api/cms/content'); contentItems = (data.content || []).map(normalizeContentItem); }
function contentThumbnail(item) {
  if (item.image) return `<img class="content-thumb" src="${escapeHtml(item.image)}" alt="">`;
  const label = item.type === 'vacancy' ? 'Career' : item.type === 'program' ? 'Program' : item.type === 'event' ? 'Activity' : 'Insight';
  return `<span class="content-thumb content-thumb-placeholder content-thumb-${escapeHtml(item.type)}" aria-hidden="true"><span>${escapeHtml(label)}</span></span>`;
}
async function renderTrash() {
  $('#admin-page').innerHTML = heading('Trash', 'Restore items or remove them permanently.') + '<div class="applications-loading">Loading Trash...</div>';
  try {
    const data = await api('/api/cms/trash'); const items = data.content || [];
    const rows = items.map(item => `<article class="content-row">${contentThumbnail(item)}<span class="content-row-title"><b>${escapeHtml(item.title)}</b><small>${escapeHtml(types[item.type]?.singular || item.type)} · Moved ${escapeHtml(dateLabel(item.deletedAt))}</small></span><span class="row-actions"><button class="icon-btn" data-restore="${escapeHtml(item.id)}">Restore</button><button class="icon-btn remove" data-forever="${escapeHtml(item.id)}">Delete forever</button></span></article>`).join('');
    $('#admin-page').innerHTML = heading('Trash', 'Restore items or remove them permanently.') + (rows ? `<div class="content-list">${rows}</div>` : '<section class="empty-panel"><h2>Trash is empty</h2><p>Items you move to Trash will appear here.</p></section>');
    $$('[data-restore]').forEach(button => button.onclick = async () => { try { await api(`/api/cms/trash/${encodeURIComponent(button.dataset.restore)}/restore`, { method: 'POST' }); await refreshContent(); renderTrash(); toast('Item restored.'); } catch (error) { toast(error.message, true); } });
    $$('[data-forever]').forEach(button => button.onclick = async () => { const item = items.find(entry => entry.id === button.dataset.forever); if (!item || !await confirmPermanentlyDelete(item)) return; try { await api(`/api/cms/trash/${encodeURIComponent(item.id)}/forever`, { method: 'DELETE' }); renderTrash(); toast('Item deleted forever.'); } catch (error) { toast(error.message, true); } });
  } catch (error) { $('#admin-page').innerHTML = heading('Trash', 'Restore items or remove them permanently.') + `<div class="empty-panel"><p>${escapeHtml(error.message)}</p></div>`; }
}
function activityChart(items, applications) {
  const now = new Date();
  const months = Array.from({ length: 6 }, (_, index) => new Date(now.getFullYear(), now.getMonth() - 5 + index, 1));
  const countsFor = (rows, dateFor) => months.map(month => rows.filter(row => {
    const date = new Date(dateFor(row));
    return Number.isFinite(date.getTime()) && date.getFullYear() === month.getFullYear() && date.getMonth() === month.getMonth();
  }).length);
  const published = countsFor(items.filter(item => item.status === 'published' && (!item.publishAt || new Date(item.publishAt).getTime() <= now.getTime())), item => item.publishAt || item.createdAt);
  const received = countsFor(applications, item => item.submittedAt);
  if (!published.some(Boolean) && !received.some(Boolean)) return '<div class="activity-chart-empty"><span class="activity-chart-empty-mark">↗</span><b>Publishing activity will appear here</b><span>As content is published and applications arrive, you’ll see the trend over time.</span></div>';
  const max = Math.max(1, ...published, ...received);
  const pointSet = values => values.map((value, index) => ({ x: 46 + index * 104, y: 155 - value / max * 112, value }));
  const smooth = points => points.map((point, index) => index === 0 ? `M ${point.x} ${point.y}` : `C ${points[index - 1].x + (point.x - points[index - 1].x) * .42} ${points[index - 1].y}, ${point.x - (point.x - points[index - 1].x) * .42} ${point.y}, ${point.x} ${point.y}`).join(' ');
  const publishedPoints = pointSet(published); const receivedPoints = pointSet(received);
  const grid = [0, 1, 2, 3].map(index => { const y = 155 - index * 37; return `<line x1="46" y1="${y}" x2="566" y2="${y}" class="chart-grid-line"/><text x="30" y="${y + 4}" class="chart-axis-label" text-anchor="end">${Math.round(max * index / 3)}</text>`; }).join('');
  const labels = months.map((month, index) => `<text x="${46 + index * 104}" y="190" class="chart-axis-label" text-anchor="middle">${month.toLocaleDateString('en', { month: 'short' })}</text>`).join('');
  const dots = (points, series) => points.map(point => `<circle cx="${point.x}" cy="${point.y}" r="3.5" class="chart-point chart-${series}-point"/>`).join('');
  return `<div class="activity-chart-wrap"><svg class="activity-chart" viewBox="0 0 590 210" role="img" aria-label="Monthly count of items published and job applications received for the last six months">${grid}<path d="${smooth(publishedPoints)}" class="chart-line chart-published" pathLength="1"/><path d="${smooth(receivedPoints)}" class="chart-line chart-applications" pathLength="1"/>${dots(publishedPoints, 'published')}${dots(receivedPoints, 'applications')}${labels}</svg><div class="chart-legend"><span><i class="legend-published"></i>Published content</span><span><i class="legend-applications"></i>Applications received</span></div></div>`;
}
async function renderOverview(stats = null) {
  const data = stats || await api('/api/cms/overview');
  let applications = [];
  try { applications = (await api('/api/cms/applications')).applications || []; } catch { /* the dashboard remains useful if the inbox is temporarily unavailable */ }
  const recent = [...contentItems].slice(0, 6);
  const recentRows = recent.length ? recent.map(item => `<div class="activity-row" data-global-search><span class="activity-icon">${svg(item.type)}</span><span><b>${escapeHtml(item.title)}</b><small>${escapeHtml(types[item.type]?.singular || item.type)} · Updated ${dateLabel(item.updatedAt)}</small></span><span class="status ${item.status}">${item.status === 'published' ? 'Published' : item.status === 'draft' ? 'Draft' : 'Closed'}</span></div>`).join('') : '<div class="empty-panel" style="padding:34px 15px;border:0"><span class="empty-panel-mark">✦</span><h2>Your publishing desk is ready</h2><p>Create a vacancy, share a report or announce your next event.</p></div>';
  const recentApplications = applications.slice(0, 4).map(item => `<a class="recent-applicant" href="#applications" data-section="applications" data-global-search><span class="applicant-avatar">${escapeHtml(String(item.name || '?').slice(0, 1).toUpperCase())}</span><span><b>${escapeHtml(item.name)}</b><small>${escapeHtml(item.contentTitle || item.vacancyTitle || 'IRONA opportunity')}</small></span><time>${escapeHtml(dateLabel(item.submittedAt))}</time></a>`).join('');
  const quickActions = Object.entries(types).map(([type, meta]) => `<button class="quick-action" data-create-type="${type}"><span class="quick-action-icon">${svg(type)}</span><span><b>New ${meta.singular}</b><small>${type === 'publication' ? 'Article, report or resource' : type === 'vacancy' ? 'Role with a clear deadline' : type === 'event' ? 'A date your audience can plan for' : type === 'program' ? 'A call, program or initiative' : 'A story from IRONA’s work'}</small></span></button>`).join('');
  $('#admin-page').innerHTML = `<div class="overview-toolbar"><div><span class="eyebrow">IRONA PUBLISHING</span><p>Content, opportunities and activity at a glance.</p></div><button class="admin-btn" data-create>＋ Create content</button></div><section class="metric-grid">${metric('Published content', data.published, 'Visible on the website', 'publication')}${metric('Drafts to finish', data.drafts, 'Saved for review', 'news')}${metric('Open vacancies', data.openVacancies, 'Accepting applications', 'vacancy')}${metric('Upcoming events', data.upcomingEvents, 'On the IRONA calendar', 'event')}${metric('Applications received', applications.length, 'For vacancies and programs', 'inbox')}</section><div class="overview-primary"><section class="panel activity-panel"><header class="panel-head"><div><h2>Publishing activity</h2><p>Content published and applications received · last six months</p></div><span class="chart-period">6 MONTHS</span></header>${activityChart(contentItems, applications)}</section><section class="panel applicants-panel"><header class="panel-head"><div><h2>Latest applications</h2><p>Recent vacancy and program applicants</p></div><button class="text-link" data-section="applications">View all →</button></header><div class="recent-applicants">${recentApplications || '<div class="recent-applicants-empty">New applicant submissions will appear here.</div>'}</div></section></div><div class="dashboard-columns"><section class="panel"><header class="panel-head"><h2>Recently updated</h2><button class="text-link" data-section="publication">Open content library →</button></header><div class="panel-body">${recentRows}</div></section><section class="panel"><header class="panel-head"><h2>Start something new</h2></header><div class="quick-actions">${quickActions}</div></section></div>`;
  animateMetricValues();
  $$('[data-create]').forEach(button => button.onclick = () => openEditor());
  $$('[data-create-type]').forEach(button => button.onclick = () => openEditor(null, button.dataset.createType));
  $$('[data-section]', $('#admin-page')).forEach(button => button.onclick = event => { event.preventDefault(); renderSection(button.dataset.section); });
}
async function renderLibrary(type) {
  const meta = types[type]; const items = contentItems.filter(item => item.type === type);
  let applications = [];
  if (type === 'vacancy') {
    try { applications = (await api('/api/cms/applications')).applications || []; } catch { /* Keep the vacancy library available if the inbox is unavailable. */ }
  }
  const action = `<button class="admin-btn" id="create-item">＋ Add ${meta.singular}</button>`;
  const title = meta.label;
  let body;
  if (!items.length) body = `<section class="empty-panel"><span class="empty-panel-mark">${svg(type)}</span><h2>Your ${meta.label.toLowerCase()} space is ready</h2><p>${meta.empty} The public page will show a polished “coming soon message until you publish something.</p><button class="admin-btn" id="empty-create">Create your first ${meta.singular}</button></section>`;
  else body = `<div class="content-toolbar"><div class="content-filters"><button class="filter-chip active" data-status-filter="all">All (${items.length})</button><button class="filter-chip" data-status-filter="published">Published (${items.filter(item => item.status === 'published' && itemStatus(item) === 'published').length})</button><button class="filter-chip" data-status-filter="scheduled">Scheduled (${items.filter(item => itemStatus(item) === 'scheduled').length})</button><button class="filter-chip" data-status-filter="draft">Drafts (${items.filter(item => item.status === 'draft').length})</button></div><input class="search-box" id="content-search" type="search" placeholder="Search ${meta.label.toLowerCase()}…" aria-label="Search content"></div><div class="content-list" id="content-list">${items.map(contentRow).join('')}</div>`;
  const metrics = libraryMetrics(type, items, applications);
  $('#admin-page').innerHTML = heading(title, 'Create, review and manage the content visitors see on IRONA’s website.', action) + metrics + body;
  animateMetricValues();
  $('#create-item')?.addEventListener('click', () => openEditor(null, type)); $('#empty-create')?.addEventListener('click', () => openEditor(null, type));
  $$('[data-status-filter]').forEach(button => button.onclick = () => { $$('[data-status-filter]').forEach(chip => chip.classList.toggle('active', chip === button)); filterRows(type, button.dataset.statusFilter); });
  $('#content-search')?.addEventListener('input', () => filterRows(type, $('.filter-chip.active')?.dataset.statusFilter || 'all'));
  bindRowActions();
}
function libraryMetrics(type, items, applications) {
  const now = Date.now();
  const published = items.filter(item => itemStatus(item) === 'published');
  const drafts = items.filter(item => item.status === 'draft').length;
  const scheduled = items.filter(item => itemStatus(item) === 'scheduled').length;
  const views = items.reduce((total, item) => total + (Number(item.views) || 0), 0);
  const closingSoon = items.filter(item => {
    const end = new Date(item.closesAt).getTime();
    return itemStatus(item) === 'published' && Number.isFinite(end) && end >= now && end <= now + 7 * 24 * 60 * 60 * 1000;
  }).length;
  let cards;
  if (type === 'vacancy') {
    const open = published.filter(item => !item.closesAt || new Date(item.closesAt).getTime() >= now).length;
    cards = metric('Open vacancies', open, 'Accepting applications', 'vacancy') + metric('Closing this week', closingSoon, 'Deadlines in the next seven days', 'clock') + metric('Applications received', applications.length, 'Across your vacancies', 'inbox') + metric('Drafts to finish', drafts, 'Not visible to applicants', 'news');
  } else if (type === 'program') {
    const open = published.filter(item => !item.closesAt || new Date(item.closesAt).getTime() >= now).length;
    cards = metric('Published programs', published.length, 'Visible on the website', 'program') + metric('Open calls', open, 'Accepting interest or applications', 'vacancy') + metric('Closing this week', closingSoon, 'Deadlines in the next seven days', 'clock') + metric('Drafts to finish', drafts, 'Saved for review', 'news');
  } else if (type === 'event') {
    const upcoming = published.filter(item => eventActivityState(item, now) === 'upcoming').length;
    cards = metric('Upcoming events', upcoming, 'Published and still to come', 'event') + metric('Published events', published.length, 'Visible on the website', 'publication') + metric('Drafts to finish', drafts, 'Saved for review', 'news') + metric('Scheduled', scheduled, 'Set to publish later', 'clock');
  } else {
    cards = metric('Published insights', published.length, 'Visible on the website', type) + metric('Drafts to finish', drafts, 'Saved for review', 'publication') + metric('Scheduled', scheduled, 'Set to publish later', 'clock') + metric('Article views', views, 'Across this section', 'eye');
  }
  return `<section class="metric-grid section-metrics">${cards}</section>`;
}
function itemStatus(item) { return item.status === 'published' && item.publishAt && new Date(item.publishAt).getTime() > Date.now() ? 'scheduled' : item.status; }
function contentRow(item) {
  const status = itemStatus(item);
  const detail = item.type === 'vacancy' ? `Closes ${dateLabel(item.closesAt)}` : item.type === 'event' ? dateLabel(item.startsAt) : `${item.views || 0} views`;
  const sub = item.type === 'publication' ? `${readTime(item)} min read · ${item.category || 'Uncategorised'}` : item.type === 'program' ? `Apply by ${dateLabel(item.closesAt)} · ${item.category || 'Program'}` : item.type === 'vacancy' ? `${item.location || 'Rwanda'} · ${detail}` : item.type === 'event' ? `${item.venue || item.location || 'Venue to be confirmed'} · ${detail}` : `${item.category || 'Update'} · ${detail}`;
  return `<article class="content-row" data-row data-id="${escapeHtml(item.id)}" data-type="${item.type}" data-status="${status}">${contentThumbnail(item)}<span class="content-row-title"><b>${escapeHtml(item.title)}</b><small>${escapeHtml(item.summary || item.content || '')}</small></span><span class="content-row-meta">${escapeHtml(sub)}</span><span class="status ${status}">${status === 'published' ? 'Published' : status === 'scheduled' ? 'Scheduled' : status === 'draft' ? 'Draft' : 'Closed'}</span><span class="row-actions"><button class="icon-btn" data-edit="${escapeHtml(item.id)}">Edit</button>${['vacancy', 'program'].includes(item.type) ? `<button class="icon-btn" data-applications="${escapeHtml(item.id)}">Applications</button>` : ''}<button class="icon-btn remove content-delete-icon" data-delete="${escapeHtml(item.id)}" aria-label="Move ${escapeHtml(item.title)} to Trash" title="Move to Trash"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6m4-6v6M6 7l1 14h10l1-14M9 7V4h6v3"/></svg></button></span></article>`;
}
function filterRows(type, status) {
  const query = ($('#content-search')?.value || '').trim().toLowerCase();
  $$('[data-row]').forEach(row => row.hidden = row.dataset.type !== type || (status !== 'all' && row.dataset.status !== status) || !row.textContent.toLowerCase().includes(query));
}
function bindRowActions() {
  $$('[data-edit]').forEach(button => button.onclick = () => { editingItem = contentItems.find(item => item.id === button.dataset.edit); openEditor(editingItem); });
  $$('[data-applications]').forEach(button => button.onclick = () => { activeSection = 'applications'; try { sessionStorage.setItem('irona-admin-active-section', 'applications'); } catch { /* Keep the Applications view usable without browser storage. */ } $$('[data-section]').forEach(nav => nav.classList.toggle('active', nav.dataset.section === 'applications')); $('#crumb-label').textContent = 'Applications'; renderApplications(button.dataset.applications); });
  $$('[data-delete]').forEach(button => button.onclick = async () => {
    const item = contentItems.find(entry => entry.id === button.dataset.delete); if (!item || !await confirmContentDelete(item)) return;
    try { await api(`/api/cms/content/${encodeURIComponent(item.id)}`, { method: 'DELETE' }); await refreshContent(); renderSection(activeSection); toast('Moved to Trash.'); }
    catch (error) { toast(error.message, true); }
  });
}
const programSectionNames = {
  'program overview': 'overview', overview: 'overview',
  'who can apply': 'eligibilityItems', eligibility: 'eligibilityItems', 'eligible applicants': 'eligibilityItems',
  'what the program offers': 'programBenefitsItems', 'program benefits': 'programBenefitsItems', benefits: 'programBenefitsItems',
  'supported value chains': 'supportedValueChains', 'value chains': 'supportedValueChains',
  'grant structure and matching rates': 'grantDetails', 'grant structure & matching rates': 'grantDetails', 'grant structure': 'grantDetails', 'matching rates': 'grantDetails',
  'key application requirements': 'applicationRequirements', 'application requirements': 'applicationRequirements', 'required documents': 'applicationRequirements',
  'how to apply': 'howToApply', 'application steps': 'howToApply',
};
const programListNames = ['eligibilityItems', 'programBenefitsItems', 'supportedValueChains', 'grantDetails', 'applicationRequirements'];
function programSectionKey(line) {
  return String(line || '').replace(/^\s*#+\s*/, '').trim().replace(/[?:\\]+$/, '').trim().toLowerCase();
}
function programParagraphItems(value) {
  return String(value || '').trim().split(/\n\s*\n/).map(block => block.split(/\r?\n/).map(line => line.trim()).filter(Boolean).join(' ').replace(/^(?:[-*]|\u2022|\d+[.)])\s*/u, '')).filter(Boolean);
}
function migrateProgramEditorFields(payload) {
  if (Number(payload.programStructureVersion) >= 1) return payload;
  const original = String(payload.content || '').replace(/\r/g, '');
  const sections = { overview: [] };
  let current = 'overview';
  let foundSection = false;
  original.split('\n').forEach(line => {
    const key = programSectionNames[programSectionKey(line)];
    if (key) { current = key; sections[current] ||= []; foundSection = true; }
    else sections[current].push(line);
  });
  const textOf = key => (sections[key] || []).join('\n').trim();
  if (foundSection) {
    payload.content = textOf('overview');
    const arrayFields = ['eligibilityItems', 'programBenefitsItems', 'supportedValueChains', 'grantDetails', 'applicationRequirements'];
    arrayFields.forEach(key => { if (!Array.isArray(payload[key]) || !payload[key].length) payload[key] = programParagraphItems(textOf(key)); });
    const howTo = textOf('howToApply');
    if (!payload.programHowToApply && howTo) payload.programHowToApply = howTo;
  }
  if (!Array.isArray(payload.eligibilityItems) || !payload.eligibilityItems.length) payload.eligibilityItems = programParagraphItems(payload.eligibility);
  if (!Array.isArray(payload.programBenefitsItems) || !payload.programBenefitsItems.length) payload.programBenefitsItems = programParagraphItems(payload.programBenefits);
  payload.eligibility = '';
  payload.programBenefits = '';
  payload.programStructureVersion = 1;
  return payload;
}
function programListRow(name, label, value = '', index = 0) {
  return `<div class="program-list-row"><input type="text" data-program-item="${name}" value="${escapeHtml(value)}" maxlength="800" aria-label="${escapeHtml(label)} ${index + 1}" placeholder="${escapeHtml(label)}"><button type="button" class="program-list-remove" data-program-remove="${name}" aria-label="Remove ${escapeHtml(label)} ${index + 1}">Remove</button></div>`;
}
function programListField(label, name, values, placeholder, addLabel, help) {
  const items = Array.isArray(values) ? values : [];
  return `<div class="admin-field wide program-list-field" data-program-list="${name}"><div class="program-list-field-heading"><span class="admin-field-label"><span>${escapeHtml(label)}</span></span><small>${escapeHtml(help)}</small></div><div class="program-list-items">${items.map((value, index) => programListRow(name, label, value, index)).join('')}</div><button type="button" class="program-list-add" data-program-add="${name}" data-label="${escapeHtml(placeholder)}">+ ${escapeHtml(addLabel)}</button></div>`;
}
function normalizedVacancySections(payload = draftPayload) {
  const normalize = section => {
    let heading = String(section?.heading || '').trim();
    if (/^skills and qualifications$/i.test(heading)) heading = 'Skills';
    return { heading, bullets: Array.isArray(section?.bullets) ? section.bullets.map(value => String(value || '').trim()).filter(Boolean) : [] };
  };
  let sections;
  if (Array.isArray(payload.roleSections) && (payload.roleSections.length || Number(payload.roleStructureVersion) >= 2)) {
    sections = payload.roleSections.map(normalize);
    if (Number(payload.roleStructureVersion) < 2) {
      for (const heading of ['Responsibilities', 'Skills', 'Qualifications']) if (!sections.some(section => section.heading.toLowerCase() === heading.toLowerCase())) sections.push({ heading, bullets: [] });
    }
    return sections;
  }
  sections = [];
  const responsibilities = Array.isArray(payload.responsibilities) ? payload.responsibilities : String(payload.responsibilities || '').split(/\r?\n/);
  const skills = Array.isArray(payload.skills) ? payload.skills : String(payload.skills || '').split(/\r?\n/);
  const qualifications = Array.isArray(payload.qualifications) ? payload.qualifications : String(payload.qualifications || '').split(/\r?\n/);
  sections.push({ heading: 'Responsibilities', bullets: responsibilities.map(value => String(value || '').trim()).filter(Boolean) });
  sections.push({ heading: 'Skills', bullets: skills.map(value => String(value || '').trim()).filter(Boolean) });
  sections.push({ heading: 'Qualifications', bullets: qualifications.map(value => String(value || '').trim()).filter(Boolean) });
  return sections;
}
function vacancyRoleSectionRow(section = {}, index = 0) {
  const bullets = Array.isArray(section.bullets) && section.bullets.length ? section.bullets : [''];
  const heading = String(section.heading || '').trim().toLowerCase();
  const bulletPlaceholder = /responsibilit|what you will do/.test(heading) ? 'Add a key responsibility' : /^skills?$/.test(heading) ? 'Add a relevant skill' : /qualifications?/.test(heading) ? 'Add a required qualification' : 'Add one clear point';
  return `<article class="vacancy-role-section" data-role-section><header class="vacancy-role-section-heading"><span class="vacancy-role-section-number">Section ${index + 1}</span><span class="insight-row-actions"><button type="button" data-role-section-move="up" aria-label="Move section ${index + 1} up" ${index === 0 ? 'disabled' : ''}>Up</button><button type="button" data-role-section-move="down" aria-label="Move section ${index + 1} down">Down</button><button class="program-list-remove" type="button" data-role-section-remove aria-label="Remove section ${index + 1}">Remove</button></span></header><label class="insight-builder-field"><span>Section heading</span><input data-role-heading maxlength="120" value="${escapeHtml(section.heading || '')}" placeholder="For example, Responsibilities"></label><div class="vacancy-role-bullets" data-role-bullets>${bullets.map((bullet, bulletIndex) => `<div class="program-list-row vacancy-role-bullet"><label class="insight-builder-field"><span>Bullet point ${bulletIndex + 1}</span><input data-role-bullet maxlength="500" value="${escapeHtml(bullet)}" placeholder="${escapeHtml(bulletPlaceholder)}"></label><button class="program-list-remove" type="button" data-role-bullet-remove aria-label="Remove bullet ${bulletIndex + 1}">Remove</button></div>`).join('')}</div><button class="program-list-add vacancy-add-bullet" type="button" data-role-bullet-add>+ Add bullet point</button></article>`;
}
function refreshVacancyRoleOrder() {
  const sections = $$('#vacancy-role-section-list [data-role-section]');
  sections.forEach((section, index) => {
    section.querySelector('.vacancy-role-section-number').textContent = `Section ${index + 1}`;
    section.querySelector('[data-role-section-remove]')?.setAttribute('aria-label', `Remove section ${index + 1}`);
    section.querySelector('[data-role-section-move="up"]')?.toggleAttribute('disabled', index === 0);
    section.querySelector('[data-role-section-move="down"]')?.toggleAttribute('disabled', index === sections.length - 1);
    const bullets = [...section.querySelectorAll('[data-role-bullet]')];
    bullets.forEach((input, bulletIndex) => {
      const label = input.closest('.vacancy-role-bullet')?.querySelector('.insight-builder-field span');
      if (label) label.textContent = `Bullet point ${bulletIndex + 1}`;
      input.closest('.vacancy-role-bullet')?.querySelector('[data-role-bullet-remove]')?.setAttribute('aria-label', `Remove bullet ${bulletIndex + 1}`);
    });
  });
}
function vacancyRoleSectionsField() {
  const sections = normalizedVacancySections();
  return `<div class="vacancy-role-builder admin-field wide"><div class="insight-builder-heading"><span class="admin-field-label"><span>Role sections</span><span class="admin-optional">Optional</span></span><small>Keep responsibilities, skills and qualifications in separate sections. Add each item as a bullet. Empty sections will not appear on the vacancy page.</small></div><div class="vacancy-role-section-list" id="vacancy-role-section-list">${sections.map(vacancyRoleSectionRow).join('')}</div><button class="program-list-add" type="button" data-role-section-add>+ Add section</button></div>`;
}
function migratePublicationEditorFields(payload) {
  if (Number(payload.articleStructureVersion) >= 1 && Array.isArray(payload.articleSections)) return payload;
  if (!Array.isArray(payload.articleSections)) {
    const lines = String(payload.content || '').replace(/\r/g, '').split('\n');
    const sections = []; let heading = ''; let body = [];
    const saveSection = () => { if (heading || body.some(line => line.trim())) sections.push({ heading, body: body.join('\n').trim() }); };
    for (const line of lines) {
      const match = line.match(/^#{1,3}\s+(.+)$/);
      if (match) { saveSection(); heading = match[1].trim(); body = []; }
      else body.push(line);
    }
    saveSection();
    payload.articleSections = sections.length ? sections : [{ heading: '', body: String(payload.content || '').trim() }];
  }
  if (!Array.isArray(payload.galleryImages)) payload.galleryImages = [];
  payload.articleStructureVersion = 1;
  return payload;
}
function openEditor(item = null, type = activeSection in types ? activeSection : 'publication') {
  editingItem = item ? { ...item } : null;
  editorBaseRevision = Number(item?.editorDraftRevision || 0);
  draftPayload = { type: item?.type || type, ...(item?.editorDraft || item || {}) };
  if (draftPayload.type === 'program') migrateProgramEditorFields(draftPayload);
  if (draftPayload.type === 'publication') migratePublicationEditorFields(draftPayload);
  if (item?.editorDraft) draftPayload.status = item.status;
  editorDirty = false; editorChangeVersion = 0; renderEditor();
}
function queueEditorAutosave() {
  editorDirty = true; editorChangeVersion += 1; clearTimeout(autosaveTimer);
  const status = $('#editor-save-status'); if (status) status.textContent = 'Unsaved changes';
  syncEditorPrimaryLabel();
  autosaveTimer = setTimeout(saveEditorDraft, 900);
}
async function saveEditorDraft() {
  if (!editorDirty || !String(draftPayload.title || '').trim() || draftPayload.title.trim().length < 3) return;
  while (editorSaving) await new Promise(resolve => setTimeout(resolve, 40));
  if (!editorDirty) return;
  editorSaving = true;
  const savedVersion = editorChangeVersion;
  let saveFailed = false;
  try {
    const body = { ...draftPayload, status: editingItem?.status === 'published' ? 'published' : 'draft', _autosave: true, _baseDraftRevision: editorBaseRevision };
    const result = await api(editingItem ? `/api/cms/content/${encodeURIComponent(editingItem.id)}` : '/api/cms/content', { method: editingItem ? 'PUT' : 'POST', body: JSON.stringify(body) });
    if (!editingItem) { editingItem = result.item; draftPayload.id = result.item.id; }
    else editingItem = result.item;
    editorBaseRevision = Number(result.draftRevision || 0); editorDirty = savedVersion !== editorChangeVersion;
    const status = $('#editor-save-status'); if (status) { status.dataset.savedAt = String(Date.now()); status.textContent = editingItem?.status === 'published' ? 'Draft saved privately just now. Press Update to apply it.' : 'Saved just now'; }
    refreshContent().catch(() => {});
  } catch (error) {
    saveFailed = true;
    const status = $('#editor-save-status'); if (status) status.textContent = error.message.includes('Someone else changed') ? error.message : 'Could not save. Your changes are still here.';
  } finally { editorSaving = false; if (editorDirty && !saveFailed && $('#content-editor')) autosaveTimer = setTimeout(saveEditorDraft, 500); }
}
function syncEditorPrimaryLabel() {
  const button = $('#publish-content'); if (!button) return;
  const status = draftPayload.status || 'draft';
  button.textContent = status === 'closed' ? 'Save as closed' : status === 'published' ? (editingItem?.status === 'published' ? 'Update website' : (draftPayload.publishAt && new Date(draftPayload.publishAt).getTime() > Date.now() ? 'Schedule on website' : 'Publish on website')) : 'Publish on website';
}
async function saveDraftExplicit() {
  readForm(); clearTimeout(autosaveTimer);
  if (String(draftPayload.title || '').trim().length < 3) { toast('Please add a title with at least 3 characters before saving.', true); $('[name="title"]')?.focus(); return; }
  const button = $('#save-draft'); button.disabled = true; button.textContent = 'Saving draft…';
  try {
    if (editorDirty) await saveEditorDraft();
    const privatePublishedEdit = editingItem?.status === 'published';
    const saveBody = { ...draftPayload, status: privatePublishedEdit ? 'published' : 'draft', _baseDraftRevision: editorBaseRevision, ...(privatePublishedEdit ? { _autosave: true } : { _manualSave: true }) };
    const saved = await api(editingItem ? `/api/cms/content/${encodeURIComponent(editingItem.id)}` : '/api/cms/content', { method: editingItem ? 'PUT' : 'POST', body: JSON.stringify(saveBody) });
    editingItem = saved.item; draftPayload.id = saved.item.id; editorBaseRevision = Number(saved.draftRevision || saved.item.editorDraftRevision || editorBaseRevision); editorDirty = false;
    const status = $('#editor-save-status'); if (status) { status.dataset.savedAt = String(Date.now()); status.textContent = privatePublishedEdit ? 'Draft saved privately. The website is unchanged until you update it.' : 'Draft saved. You can publish it when ready.'; }
    await refreshContent(); syncEditorPrimaryLabel(); toast('Draft saved.');
  } catch (error) { toast(error.message || 'The draft could not be saved. Your changes are still here.', true); }
  finally { button.disabled = false; button.textContent = 'Save draft'; }
}
async function publishEditorContent() {
  readForm(); clearTimeout(autosaveTimer);
  const button = $('#publish-content'); button.disabled = true; button.textContent = 'Saving…';
  try {
    if (editorDirty) await saveEditorDraft();
    if (String(draftPayload.title || '').trim().length < 3) throw new Error('Please add a title with at least 3 characters before publishing.');
    if (draftPayload.status !== 'closed') {
      draftPayload.status = 'published';
      if (!draftPayload.publishAt) draftPayload.publishAt = new Date().toISOString();
      const issue = editorPublishIssue();
      if (issue) { const target = $('#content-editor')?.elements.namedItem(issue.field) || document.getElementById(issue.field); target?.focus(); target?.scrollIntoView({ behavior: 'smooth', block: 'center' }); throw new Error(issue.message); }
    }
    const scheduled = draftPayload.status === 'published' && draftPayload.publishAt && new Date(draftPayload.publishAt).getTime() > Date.now();
    const saveBody = { ...draftPayload, _manualSave: true, _baseDraftRevision: editorBaseRevision, ...(editingItem?.status === 'published' && editingItem.editorDraft ? { _commitDraft: true } : {}) };
    const saved = await api(editingItem ? `/api/cms/content/${encodeURIComponent(editingItem.id)}` : '/api/cms/content', { method: editingItem ? 'PUT' : 'POST', body: JSON.stringify(saveBody) });
    editorDirty = false; await refreshContent();
    toast(saved.item.status === 'closed' ? 'Item saved as closed.' : scheduled ? `Scheduled for ${new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(saved.item.publishAt))}.` : 'Published on the IRONA website.');
    renderSection(activeSection);
  } catch (error) { button.disabled = false; syncEditorPrimaryLabel(); toast(error.message || 'The item could not be published. Your changes are still here.', true); }
}
function field(label, name, value = '', options = {}) {
  const required = options.required ? 'required' : '';
  const wide = options.wide ? 'wide' : '';
  const cleanLabel = String(label).replace(/\s*\*$/, '');
  const labelMarkup = `<span class="admin-field-label"><span>${escapeHtml(cleanLabel)}</span>${options.required ? '<span class="admin-required">Required</span>' : ''}</span>`;
  if (options.select) return `<label class="admin-field ${wide}">${labelMarkup}<select name="${name}" ${required}>${options.select.map(option => `<option value="${escapeHtml(option.value)}" ${option.value === value ? 'selected' : ''}>${escapeHtml(option.label)}</option>`).join('')}</select>${options.help ? `<small>${escapeHtml(options.help)}</small>` : ''}</label>`;
  const inputValue = options.type === 'datetime-local' ? (options.timezone === 'Kigali' ? kigaliDateInput(value) : dateInput(value)) : value;
  const element = options.textarea ? `<textarea name="${name}" maxlength="${options.maxlength || 60000}" ${required} placeholder="${escapeHtml(options.placeholder || '')}">${escapeHtml(value)}</textarea>` : `<input name="${name}" type="${options.type || 'text'}" value="${escapeHtml(inputValue)}" maxlength="${options.maxlength || 500}" ${required} placeholder="${escapeHtml(options.placeholder || '')}">`;
  return `<label class="admin-field ${wide}">${labelMarkup}${element}${options.help ? `<small>${escapeHtml(options.help)}</small>` : ''}</label>`;
}
function editorFields() {
  const type = draftPayload.type;
  const contentLabel = type === 'vacancy' ? 'Role overview' : type === 'program' ? 'Program overview' : type === 'event' ? 'Activity details' : 'Article or report';
  const contentHelp = type === 'vacancy' ? 'Describe the purpose of the role, its scope and who it works with. This is the full role overview; keep the short introduction above concise and do not repeat it here.' : type === 'program' ? 'Write the program overview in paragraphs. The website adds the heading, so do not repeat it here.' : type === 'event' ? 'Write the full account: who took part, what happened and why it matters. Do not repeat the short introduction.' : 'Add the story in sections. Give each section a heading when it helps readers follow the report.';
  const basicsClass = type === 'program' ? 'program-editor' : type === 'publication' ? 'insight-editor' : type === 'event' ? 'event-editor' : type === 'vacancy' ? 'vacancy-editor' : '';
  const basics = `<section class="editor-section ${basicsClass}" id="section-basics"><h2>${type === 'program' ? 'Program name and introduction' : type === 'publication' ? 'Title and introduction' : type === 'event' ? 'Activity overview' : type === 'vacancy' ? 'Role title and introduction' : 'Basics'}</h2><p>${type === 'program' ? 'This title and introduction appear on the program card and at the top of its page.' : type === 'publication' ? 'The title and short introduction introduce the Insight on the website.' : type === 'event' ? 'Give the activity a clear name and a short description for the website.' : type === 'vacancy' ? 'Use a concise introduction for the vacancy card and the top of its page.' : 'Start with the name and a short introduction.'}</p><div class="form-grid">${field(type === 'event' ? 'Activity title' : type === 'program' ? 'Program title' : type === 'vacancy' ? 'Job title' : 'Title', 'title', draftPayload.title, { required: true, maxlength: 180, wide: true, placeholder: type === 'program' ? 'For example, KWIHAZA Credit-Linked Subsidy Facility' : type === 'publication' ? 'For example, Rwanda SME Finance Outlook' : type === 'event' ? 'For example, Small business finance workshop' : type === 'vacancy' ? 'For example, Finance Officer' : 'For example, Youth Enterprise Training' })}${field(['program', 'publication', 'event'].includes(type) ? 'Short introduction' : type === 'vacancy' ? 'Short description' : 'Short description', 'summary', draftPayload.summary, { textarea: true, required: ['program', 'publication', 'event'].includes(type), maxlength: 500, wide: true, placeholder: type === 'program' ? 'One or two sentences that explain the program.' : type === 'publication' ? 'A concise summary that appears beneath the title and on the Insight card.' : type === 'event' ? 'In one or two sentences, explain the purpose of this activity.' : type === 'vacancy' ? 'In two or three sentences, explain the role and who should apply.' : 'In a few sentences, explain what this is and who it is for.', help: type === 'program' ? 'Shown beneath the title and on the program card.' : type === 'publication' ? 'This is the article subheading and card summary.' : type === 'event' ? 'Shown on the activity card and below the cover photo. Keep it brief; use Activity details for the full story.' : type === 'vacancy' ? 'Shown on the vacancy card and beneath the title. Keep it concise; use Role overview for full details.' : '' })}</div></section>`;
  const insightFields = `${articleSectionsField()}${publicationCoverField()}${galleryImagesField()}${reportFileField()}`;
  const eventStoryFields = `<div class="admin-field wide event-cover-field"><span class="admin-field-label"><span>Cover photo</span><span class="admin-required">Required</span></span><small>Shown on the activity card and at the top of its page.</small>${mediaField()}${field('Photo caption', 'imageCaption', draftPayload.imageCaption, { placeholder: 'Optional. Add a photo credit or brief context.', wide: true })}</div>${galleryImagesField('event')}${field('Activity details', 'content', draftPayload.content, { textarea: true, required: true, wide: true, maxlength: 60000, placeholder: contentHelp, help: 'Write the full account in clear paragraphs. Add useful context and what happened. Do not repeat the short introduction.' })}`;
  const otherFields = type === 'event' ? eventStoryFields : `${field(contentLabel, 'content', draftPayload.content, { textarea: true, required: true, wide: true, maxlength: 60000, placeholder: contentHelp, help: contentHelp })}${type === 'vacancy' ? vacancyRoleSectionsField() : type === 'program' ? `<div class="admin-field wide"><span>Cover photo</span>${mediaField()}</div>` : ''}`;
  const story = `<section class="editor-section ${type === 'publication' ? 'insight-editor' : type === 'program' ? 'program-editor' : type === 'event' ? 'event-editor' : type === 'vacancy' ? 'vacancy-editor' : ''}" id="section-content"><h2>${type === 'vacancy' ? 'Role overview and criteria' : type === 'program' ? 'Overview and flyer' : type === 'event' ? 'Cover and activity details' : type === 'publication' ? 'Article and photos' : 'Article and photos'}</h2><p>${type === 'publication' ? 'Arrange the article in sections, then add its cover, supporting photos and optional report PDF.' : type === 'event' ? 'Add the main photo and enough detail for people to understand the activity.' : type === 'vacancy' ? 'Describe the role, then organize candidate criteria into separate, clearly titled sections.' : contentHelp}</p><div class="form-grid">${type === 'publication' ? insightFields : otherFields}</div></section>`;
  let details = '';
  if (type === 'vacancy') details = `${field('Location', 'location', draftPayload.location || 'Rwanda', { placeholder: 'Kigali or Remote' })}${field('Application closing date', 'closesAt', draftPayload.closesAt, { type: 'datetime-local', required: true })}`;
  if (type === 'program') details = `${field('Location', 'location', draftPayload.location || 'Rwanda', { placeholder: 'Kigali or Remote' })}${programListField('Who can apply?', 'eligibilityItems', draftPayload.eligibilityItems, 'Eligible group or condition', 'Add eligibility point', 'Add one group or requirement per item. These appear as bullet points.')}${programListField('What the program offers', 'programBenefitsItems', draftPayload.programBenefitsItems, 'Support, training or funding offered', 'Add benefit', 'List the main support people receive.')}${programListField('Supported value chains', 'supportedValueChains', draftPayload.supportedValueChains, 'Value chain and details', 'Add value chain', 'Add one value chain per item.')}${programListField('Grant structure', 'grantDetails', draftPayload.grantDetails, 'Grant amount, rate or budget range', 'Add grant detail', 'Add each grant range or matching rate separately.')}${programListField('Application requirements', 'applicationRequirements', draftPayload.applicationRequirements, 'Document or requirement', 'Add requirement', 'List each document or requirement separately.')}${field('How to apply', 'programHowToApply', draftPayload.programHowToApply, { textarea: true, wide: true, maxlength: 5000, placeholder: 'Briefly explain how applicants should begin.' })}${field('Applications open', 'opensAt', draftPayload.opensAt, { type: 'datetime-local', help: 'Use Kigali time. Leave blank if applications open when this program is published.' })}${field('Application closing date', 'closesAt', draftPayload.closesAt, { type: 'datetime-local', help: 'Use Kigali time. Leave blank if there is no closing date.' })}${field('Google Forms link', 'googleFormUrl', draftPayload.googleFormUrl, { type: 'url', wide: true, maxlength: 1000, placeholder: 'https://docs.google.com/forms/...', help: 'Paste the link from Google Forms. People will see it after they register.' })}<div class="program-form-link-actions wide"><button class="admin-btn secondary" type="button" id="program-google-link-test">Test Google Forms link</button><span id="program-google-link-status" role="status" aria-live="polite">Check that the link opens the correct form.</span></div>`;
  if (type === 'event') details = field('Start date and time', 'startsAt', draftPayload.startsAt, { type: 'datetime-local', timezone: 'Kigali', required: true, help: 'Enter the start time in Kigali time.' }) + field('End date and time', 'endsAt', draftPayload.endsAt, { type: 'datetime-local', timezone: 'Kigali', help: 'Optional. Use Kigali time. If blank, the activity ends at its start time for its status.' }) + '<p class="event-editor-state-note wide" id="event-editor-state-note" role="status"></p>' + field('Venue or online', 'venue', draftPayload.venue, { placeholder: 'For example, Kigali Convention Centre or Online' }) + field('City or location', 'location', draftPayload.location, { placeholder: 'For example, Kigali, Rwanda' }) + field('Activity type', 'activityType', draftPayload.activityType, { select: [{ value: '', label: 'Choose a type' }, ...['Training', 'Workshop', 'Conference', 'Meeting', 'Field visit', 'Community activity', 'Other'].map(value => ({ value, label: value }))], help: 'Choose the closest match.' }) + field('Partners or organisers', 'organizers', draftPayload.organizers, { placeholder: 'For example, IRONA and partner organisations' }) + '<div data-event-state-field="upcoming">' + field('Registration link', 'registrationUrl', draftPayload.registrationUrl, { type: 'url', wide: true, placeholder: 'https://example.com/register', help: 'Optional. Add the page people should use to register for this activity.' }) + '</div><div data-event-state-field="completed">' + field('Outcomes', 'outcomes', draftPayload.outcomes, { textarea: true, wide: true, maxlength: 3000, placeholder: 'What did participants learn, complete or achieve?', help: 'Optional. Share the main results of the activity.' }) + '</div>';
  if (type === 'publication') details = `${field('Topic', 'category', draftPayload.category, { placeholder: 'For example, Research or Financial inclusion.' })}${field('Author or team', 'author', draftPayload.author || 'IRONA Consultants')}`;
  const publishing = `<section class="editor-section ${type === 'program' ? 'program-editor' : type === 'publication' ? 'insight-editor' : type === 'event' ? 'event-editor' : type === 'vacancy' ? 'vacancy-editor' : ''}" id="section-publishing"><h2>Publishing</h2><p>Choose who can see this item.</p><div class="form-grid">${type !== 'program' ? field('Author or team', 'author', draftPayload.author || 'IRONA Consultants') : ''}${field('Status', 'status', draftPayload.status || 'draft', { select: [{ value: 'draft', label: 'Draft, staff only' }, { value: 'published', label: 'Published on the website' }, { value: 'closed', label: 'Closed' }] })}${type !== 'vacancy' ? field('Publish date', 'publishAt', draftPayload.publishAt || '', { type: 'datetime-local', help: 'Leave blank to publish now.' }) : ''}</div></section>`;
  return `${basics}${story}${`<section class="editor-section ${type === 'program' ? 'program-editor' : type === 'publication' ? 'insight-editor' : type === 'event' ? 'event-editor' : type === 'vacancy' ? 'vacancy-editor' : ''}" id="section-details"><h2>${type === 'vacancy' ? 'Role details' : type === 'program' ? 'Program details and application' : type === 'event' ? 'Date, place and registration' : 'Insight details'}</h2><div class="form-grid">${details}</div></section>`}${publishing}`;
}
function mediaField() {
  return `<label class="upload-zone" for="cover-upload"><input id="cover-upload" type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"><strong>Choose a cover photo or drop it here</strong><small>JPG, PNG or WebP · Up to ${escapeHtml(document.documentElement.dataset.maxUpload || '8')} MB</small></label><div id="image-preview">${draftPayload.image ? `<div class="upload-preview"><img src="${escapeHtml(draftPayload.image)}" alt=""><span>${escapeHtml(draftPayload.imageAlt || 'Current cover photo')}</span></div>` : ''}</div>${field('Describe the photo in a few words', 'imageAlt', draftPayload.imageAlt, { placeholder: 'For example, IRONA staff at a training session.', wide: true })}`;
}
function articleSectionRow(section = {}, index = 0, total = index + 1) {
  return `<article class="insight-section-row" data-article-section><header><span class="insight-section-number">Section ${index + 1}</span><span class="insight-row-actions"><button type="button" data-article-move="up" aria-label="Move section ${index + 1} up" ${index === 0 ? 'disabled' : ''}>Up</button><button type="button" data-article-move="down" aria-label="Move section ${index + 1} down" ${index >= total - 1 ? 'disabled' : ''}>Down</button><button class="program-list-remove" type="button" data-article-remove aria-label="Remove section ${index + 1}">Remove</button></span></header><label class="insight-builder-field"><span>Section heading <small>Optional</small></span><input data-article-heading maxlength="180" value="${escapeHtml(section.heading || '')}" placeholder="For example, Key findings"></label><label class="insight-builder-field"><span>Section text</span><textarea data-article-body maxlength="15000" rows="5" placeholder="Write this part of the article.">${escapeHtml(section.body || '')}</textarea></label></article>`;
}
function articleSectionsField() {
  const stored = Array.isArray(draftPayload.articleSections) ? draftPayload.articleSections : [];
  const sections = stored.length ? stored : [{ heading: '', body: '' }];
  return `<div class="insight-article-builder admin-field wide"><div class="insight-builder-heading"><span class="admin-field-label"><span>Article content</span><span class="admin-required">Required</span></span><small>Build the story in reading order. Add a section heading when it helps readers scan the article.</small></div><div class="insight-section-list" id="insight-section-list">${sections.map((section, index) => articleSectionRow(section, index, sections.length)).join('')}</div><button type="button" class="program-list-add" data-article-add>+ Add section</button></div>`;
}
function publicationCoverField() {
  return `<div class="admin-field wide insight-media-field"><span class="admin-field-label"><span>Cover photo</span><span class="admin-required">Required</span></span><small class="insight-field-help">This is the main image shown on the Insight card and article page.</small>${mediaField()}${field('Photo caption', 'imageCaption', draftPayload.imageCaption, { placeholder: 'Optional. Shown below the cover photo.' })}</div>`;
}
function galleryImageRow(photo = {}, index = 0, total = index + 1) {
  return `<article class="insight-gallery-row" data-gallery-image data-image="${escapeHtml(photo.image || '')}"><img src="${escapeHtml(photo.image || '')}" alt=""><div class="insight-gallery-fields"><span class="insight-section-number">Supporting photo ${index + 1}</span><label class="insight-builder-field"><span>Describe the photo in a few words</span><input data-gallery-alt maxlength="180" value="${escapeHtml(photo.alt || '')}" placeholder="Briefly describe what the photo shows"></label><label class="insight-builder-field"><span>Photo caption <small>Optional</small></span><input data-gallery-caption maxlength="300" value="${escapeHtml(photo.caption || '')}" placeholder="A short caption shown below the photo"></label></div><span class="insight-row-actions insight-gallery-actions"><button type="button" data-gallery-move="up" aria-label="Move supporting photo ${index + 1} up" ${index === 0 ? 'disabled' : ''}>Up</button><button type="button" data-gallery-move="down" aria-label="Move supporting photo ${index + 1} down" ${index >= total - 1 ? 'disabled' : ''}>Down</button><button class="program-list-remove" type="button" data-gallery-remove aria-label="Remove supporting photo ${index + 1}">Remove</button></span></article>`;
}
function galleryImagesField(type = 'publication') {
  const photos = Array.isArray(draftPayload.galleryImages) ? draftPayload.galleryImages : [];
  const event = type === 'event';
  return `<div class="insight-gallery-builder ${event ? 'event-gallery-builder' : ''} admin-field wide"><div class="insight-builder-heading"><span class="admin-field-label"><span>Supporting photos</span><span class="admin-optional">Optional</span></span><small>${event ? 'Add more moments from the activity and arrange them in the order they should appear.' : 'Add photos to accompany the article, then arrange them in the order readers should see them.'}</small></div><div class="insight-gallery-list" id="insight-gallery-list">${photos.map((photo, index) => galleryImageRow(photo, index, photos.length)).join('')}</div><label class="upload-zone insight-gallery-upload" for="gallery-upload"><input id="gallery-upload" type="file" multiple accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"><strong>+ Add supporting photos</strong><small>Choose one or more JPG, PNG or WebP files. Up to 3 MB each.</small></label><small id="insight-gallery-status" role="status" aria-live="polite"></small></div>`;
}
function reportFileField() {
  const attached = draftPayload.downloadUrl;
  return `<div class="admin-field wide insight-report-field"><span class="admin-field-label"><span>Report PDF</span><span class="admin-optional">Optional</span></span><small class="insight-field-help">Upload a PDF readers can download. The Insight title will identify it on the website.</small><label class="upload-zone insight-report-upload" for="report-upload"><input id="report-upload" type="file" accept="application/pdf,.pdf"><strong>${attached ? 'Replace report PDF' : 'Choose a report PDF'}</strong><small>PDF up to 3 MB</small></label><div id="report-preview">${attached ? `<div class="insight-file-attached"><span><b>${escapeHtml(draftPayload.reportFileName || 'Report PDF attached')}</b><small>Ready to publish</small></span><span class="insight-file-actions"><a href="${escapeHtml(attached)}" target="_blank" rel="noopener noreferrer">Preview</a><button type="button" data-remove-report>Remove</button></span></div>` : ''}</div></div>`;
}
function refreshInsightRowOrder() {
  const sectionRows = $$('#insight-section-list [data-article-section]');
  sectionRows.forEach((row, index) => {
    row.querySelector('.insight-section-number').textContent = `Section ${index + 1}`;
    row.querySelector('[data-article-remove]')?.setAttribute('aria-label', `Remove section ${index + 1}`);
    row.querySelector('[data-article-move="up"]')?.toggleAttribute('disabled', index === 0);
    row.querySelector('[data-article-move="down"]')?.toggleAttribute('disabled', index === sectionRows.length - 1);
  });
  const photoRows = $$('#insight-gallery-list [data-gallery-image]');
  photoRows.forEach((row, index) => {
    row.querySelector('.insight-section-number').textContent = `Supporting photo ${index + 1}`;
    row.querySelector('[data-gallery-remove]')?.setAttribute('aria-label', `Remove supporting photo ${index + 1}`);
    row.querySelector('[data-gallery-move="up"]')?.toggleAttribute('disabled', index === 0);
    row.querySelector('[data-gallery-move="down"]')?.toggleAttribute('disabled', index === photoRows.length - 1);
  });
}
function reviewMarkup() {
  const type = draftPayload.type;
  const body = String(draftPayload.content || '').trim();
  const stats = [draftPayload.category || types[type].label, draftPayload.author || 'IRONA Consultants', type === 'publication' ? `${readTime(draftPayload)} min read` : '', draftPayload.startsAt ? dateLabel(draftPayload.startsAt) : '', draftPayload.location || draftPayload.venue || '', draftPayload.closesAt ? `Applications close ${dateLabel(draftPayload.closesAt)}` : ''].filter(Boolean).join(' · ');
  const summary = String(draftPayload.summary || '').trim();
  const story = body ? body.split(/\n\s*\n/).map(paragraph => `<p>${escapeHtml(paragraph)}</p>`).join('') : '<p class="preview-placeholder">The full story will appear here when added.</p>';
  const programPreviewSection = (title, values, ordered = false) => values?.length ? `<section><h4>${escapeHtml(title)}</h4><${ordered ? 'ol' : 'ul'}>${values.map(value => `<li>${escapeHtml(value)}</li>`).join('')}</${ordered ? 'ol' : 'ul'}></section>` : '';
  const programExtra = type === 'program'
    ? `${programPreviewSection('Who can apply?', draftPayload.eligibilityItems)}${programPreviewSection('What the program offers', draftPayload.programBenefitsItems)}${programPreviewSection('Supported value chains', draftPayload.supportedValueChains)}${programPreviewSection('Grant structure', draftPayload.grantDetails)}${programPreviewSection('Application requirements', draftPayload.applicationRequirements)}${draftPayload.programHowToApply ? `<section><h4>How to apply</h4><p>${escapeHtml(draftPayload.programHowToApply)}</p></section>` : ''}`
    : '';
  const extra = type === 'program' ? programExtra : type === 'vacancy'
    ? normalizedVacancySections().filter(section => section.bullets.length).map(section => `<section><h3>${escapeHtml(section.heading || 'Role details')}</h3><ul>${section.bullets.map(value => `<li>${escapeHtml(value)}</li>`).join('')}</ul></section>`).join('')
    : type === 'event' && draftPayload.outcomes ? `<section><h3>Outcomes</h3>${String(draftPayload.outcomes).split(/\n\s*\n/).map(paragraph => `<p>${escapeHtml(paragraph)}</p>`).join('')}</section>` : '';
  const action = ['vacancy', 'program'].includes(type) ? `<span class="preview-action">${type === 'vacancy' ? 'View role and apply' : 'View program and apply'} <b aria-hidden="true">→</b></span>` : type === 'publication' && draftPayload.downloadUrl ? `<span class="preview-action">${escapeHtml(draftPayload.downloadLabel || 'Download report')} <b aria-hidden="true">↓</b></span>` : type === 'event' && draftPayload.activityState !== 'completed' && draftPayload.registrationUrl ? '<span class="preview-action">Registration information <b aria-hidden="true">→</b></span>' : '';
  return `<article class="review-card public-preview public-preview-${escapeHtml(type)}">${draftPayload.image ? `<img class="review-image" src="${escapeHtml(draftPayload.image)}" alt="${escapeHtml(draftPayload.imageAlt || '')}">` : `<div class="review-image review-image-empty">${escapeHtml(types[type].singular)}</div>`}<div class="review-copy"><span class="article-type-pill">${escapeHtml(types[type].singular)}</span><div class="review-meta">${escapeHtml(stats)}</div><h3>${escapeHtml(draftPayload.title || 'Your content title')}</h3>${summary ? `<p class="preview-summary">${escapeHtml(summary)}</p>` : ''}<div class="preview-story">${story}</div>${extra}${action}</div></article>`;
}
function checklistMarkup() {
  const type = draftPayload.type;
  const has = value => Boolean(String(value || '').trim());
  const done = value => ({ complete: Boolean(value), label: value ? 'Ready' : 'Add this' });
  const items = [
    { field: 'title', title: 'Title', copy: 'Add a clear name for this item.', ...done(has(draftPayload.title)) },
    { field: 'summary', title: ['publication', 'event', 'program', 'vacancy'].includes(type) ? 'Short introduction' : 'Short description', copy: type === 'publication' ? 'This appears beneath the Insight title and on its card.' : type === 'event' ? 'Shown on the activity card and beneath its title.' : type === 'vacancy' ? 'A concise introduction shown on the vacancy card and page.' : 'Give visitors a quick introduction.', ...done(has(draftPayload.summary) || (!['publication', 'event', 'program'].includes(type) && has(draftPayload.content))) }
  ];
  if (type === 'vacancy') {
    items.push({ field: 'content', title: 'Role overview', copy: 'Describe the role in detail without repeating the short introduction.', ...done(has(draftPayload.content)) });
    items.push({ field: 'vacancy-role-section-list', title: 'Responsibilities, skills and qualifications', copy: 'Keep each criterion under its own heading and add the points as bullets.', label: normalizedVacancySections().some(section => section.heading && section.bullets.length) ? 'Added' : 'Optional', complete: true });
    items.push({ field: 'closesAt', title: 'Application deadline', copy: 'Set a clear closing date for candidates.', ...done(has(draftPayload.closesAt)) });
  } else if (type === 'program') {
    items.push({ field: 'content', title: 'Program details', copy: 'Explain the program and who can apply.', ...done(has(draftPayload.content)) });
    items.push({ field: 'googleFormUrl', title: 'Google Forms link', copy: 'People continue to this form after registering.', label: has(draftPayload.googleFormUrl) ? 'Added' : 'Required to publish', complete: has(draftPayload.googleFormUrl) });
    items.push({ field: 'closesAt', title: 'Application deadline', copy: 'Add a closing date if this program has one.', label: has(draftPayload.closesAt) ? 'Ready' : 'Optional', complete: true });
  } else if (type === 'publication') {
    items.push({ field: 'insight-section-list', title: 'Article sections', copy: 'Add the article text and use headings to organise it.', ...done((draftPayload.articleSections || []).some(section => has(section.body))) });
    items.push({ field: 'cover-upload', title: 'Cover photo', copy: 'Add a photo that represents this story.', ...done(has(draftPayload.image)) });
    items.push({ field: 'report-upload', title: 'Report PDF', copy: 'Optional. Add a PDF readers can preview or download.', label: draftPayload.downloadUrl ? 'Attached' : 'Optional', complete: true });
  } else if (type === 'event') {
    items.push({ field: 'content', title: 'Activity details', copy: 'Explain what the activity is about or what took place.', ...done(has(draftPayload.content)) });
    items.push({ field: 'startsAt', title: 'Start date and time', copy: 'Use Kigali time. The end date determines when the activity is completed.', ...done(has(draftPayload.startsAt)) });
    items.push({ field: 'cover-upload', title: 'Cover photo', copy: 'Add the main photo for the activity card and page.', ...done(has(draftPayload.image)) });
    if (draftPayload.activityState !== 'completed') items.push({ field: 'registrationUrl', title: 'Registration link', copy: 'Optional. Add it for upcoming activities that need registration.', label: has(draftPayload.registrationUrl) ? 'Added' : 'Optional', complete: true });
  }
  return items.map(item => `<button type="button" class="side-help ${item.complete ? 'is-ready' : 'is-incomplete'}" data-field="${escapeHtml(item.field)}"><span class="checklist-state" aria-hidden="true">${item.complete ? '✓' : '•'}</span><span><b>${escapeHtml(item.title)}</b><span class="checklist-label">${escapeHtml(item.label)}</span><span class="checklist-copy">${escapeHtml(item.copy)}</span></span></button>`).join('');
}
function editorPublishIssue() {
  const type = draftPayload.type;
  if (!String(draftPayload.title || '').trim()) return { step: 1, field: 'title', message: 'Add a title before publishing.' };
  if (type === 'publication' && !String(draftPayload.summary || '').trim()) return { step: 1, field: 'summary', message: 'Add a short introduction for the Insight.' };
  if (type === 'program' && !String(draftPayload.summary || '').trim()) return { step: 1, field: 'summary', message: 'Add a short introduction for the program card.' };
  if (type === 'event' && !String(draftPayload.summary || '').trim()) return { step: 1, field: 'summary', message: 'Add a short introduction for the activity.' };
  if (type === 'vacancy' && !String(draftPayload.content || '').trim()) return { step: 2, field: 'content', message: 'Add the role overview before publishing this vacancy.' };
  if (type === 'publication' && !(draftPayload.articleSections || []).some(section => String(section.body || '').trim())) return { step: 2, field: 'insight-section-list', message: 'Add article text before publishing this Insight.' };
  if (['event', 'program'].includes(type) && !String(draftPayload.content || '').trim()) return { step: 2, field: 'content', message: `Add ${type === 'event' ? 'the event details' : 'the program details'} before publishing.` };
  if (type === 'news' && !String(draftPayload.content || '').trim() && !String(draftPayload.summary || '').trim()) return { step: 2, field: 'content', message: 'Add the story or a short introduction before publishing.' };
  if (['publication', 'event'].includes(type) && !String(draftPayload.image || '').startsWith('/media/')) return { step: 2, field: 'cover-upload', message: 'Add a cover photo before publishing this item.' };
  if (type === 'event' && !draftPayload.startsAt) return { step: 3, field: 'startsAt', message: 'Add the activity start date and time before publishing.' };
  if (type === 'event' && draftPayload.endsAt && new Date(draftPayload.endsAt) < new Date(draftPayload.startsAt)) return { step: 3, field: 'endsAt', message: 'The end date and time must be after the start.' };
  if (type === 'program' && !String(draftPayload.googleFormUrl || '').trim()) return { step: 1, field: 'googleFormUrl', message: 'Add a Google Forms link before publishing this program.' };
  if (type === 'program' && !/^https:(?:\/\/)(?:docs\.google\.com\/forms\/|forms\.gle\/)/i.test(String(draftPayload.googleFormUrl || ''))) return { step: 1, field: 'googleFormUrl', message: 'Enter a Google Forms address before publishing this program.' };
  if (type === 'vacancy' && !draftPayload.closesAt) return { step: 1, field: 'closesAt', message: 'Add an application closing date before publishing this vacancy.' };
  return null;
}
function renderEditor() {
  const type = draftPayload.type;
  const editorIntro = type === 'vacancy' ? 'Introduce the opportunity, explain the role and organize criteria into clear sections.' : 'Add the information people need, then save it as a draft or publish it.';
  const sections = type === 'event' ? [['section-basics', 'Overview'], ['section-content', 'Activity details'], ['section-details', 'Date and place'], ['section-publishing', 'Publishing']] : type === 'vacancy' ? [['section-basics', 'Role intro'], ['section-content', 'Role overview'], ['section-details', 'Role details'], ['section-publishing', 'Publishing']] : [['section-basics', 'Basics'], ['section-content', 'Content'], ['section-details', 'Details'], ['section-publishing', 'Publishing']];
  const anchors = sections.map(([id, label]) => `<a href="#${id}">${label}</a>`).join('');
  $('#admin-page').innerHTML = heading(editingItem ? `Edit ${types[type].singular}` : `Create ${types[type].singular}`, editorIntro) + `<div class="editor-layout"><section class="editor-main"><nav class="editor-section-nav" aria-label="Form sections">${anchors}</nav><div class="editor-save-status" id="editor-save-status" role="status">${editingItem?.status === 'published' ? 'Edits save privately. Press Update website to apply them.' : 'Draft saves as you work.'}</div><form id="content-editor" class="${type === 'vacancy' ? 'vacancy-editor-form' : ''}">${editorFields()}<div class="step-actions"><button class="admin-btn ghost" type="button" id="cancel-editor">Cancel</button><div class="editor-submit-actions"><button class="admin-btn secondary" type="button" id="save-draft">Save draft</button><button class="admin-btn" type="button" id="publish-content">${editingItem?.status === 'published' ? 'Update website' : 'Publish on website'}</button></div></div></form></section><aside class="editor-aside"><div class="checklist-heading"><h3>Before you publish</h3><p>Select a reminder to jump to its field.</p></div><div id="editor-checklist" class="editor-checklist">${checklistMarkup()}</div></aside></div>`;
  syncEditorPrimaryLabel();
  syncEventConditionalFields();
  editorSectionObserver?.disconnect();
  const navLinks = $$('.editor-section-nav a');
  editorSectionObserver = new IntersectionObserver(entries => {
    const visible = entries.filter(entry => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
    if (!visible) return;
    navLinks.forEach(link => { const active = link.hash === `#${visible.target.id}`; link.classList.toggle('active', active); if (active) link.setAttribute('aria-current', 'location'); else link.removeAttribute('aria-current'); });
  }, { rootMargin: '-120px 0px -68% 0px', threshold: 0 });
  $$('.editor-section').forEach(section => editorSectionObserver.observe(section));
  $('#cancel-editor').onclick = async () => { if (!await prepareToLeaveEditor()) return; renderSection(activeSection); };
  $('#save-draft').onclick = () => saveDraftExplicit();
  $('#publish-content').onclick = () => publishEditorContent();
  $('#content-editor').addEventListener('change', () => { readForm(); syncEventConditionalFields(); $('#editor-checklist').innerHTML = checklistMarkup(); syncEditorPrimaryLabel(); queueEditorAutosave(); });
  $('#content-editor').addEventListener('input', () => { readForm(); syncEventConditionalFields(); $('#editor-checklist').innerHTML = checklistMarkup(); syncEditorPrimaryLabel(); queueEditorAutosave(); });
  $('#content-editor').addEventListener('click', event => {
    const addButton = event.target.closest('[data-program-add]');
    const removeButton = event.target.closest('[data-program-remove]');
    const addArticleSection = event.target.closest('[data-article-add]');
    const removeArticleSection = event.target.closest('[data-article-remove]');
    const moveArticleSection = event.target.closest('[data-article-move]');
    const removeGalleryPhoto = event.target.closest('[data-gallery-remove]');
    const moveGalleryPhoto = event.target.closest('[data-gallery-move]');
    const removeReport = event.target.closest('[data-remove-report]');
    const addRoleSection = event.target.closest('[data-role-section-add]');
    const removeRoleSection = event.target.closest('[data-role-section-remove]');
    const moveRoleSection = event.target.closest('[data-role-section-move]');
    const addRoleBullet = event.target.closest('[data-role-bullet-add]');
    const removeRoleBullet = event.target.closest('[data-role-bullet-remove]');
    if (!addButton && !removeButton && !addArticleSection && !removeArticleSection && !moveArticleSection && !removeGalleryPhoto && !moveGalleryPhoto && !removeReport && !addRoleSection && !removeRoleSection && !moveRoleSection && !addRoleBullet && !removeRoleBullet) return;
    event.preventDefault();
    if (addArticleSection) {
      const list = $('#insight-section-list');
      if (list?.children.length >= 30) { toast('An Insight can have up to 30 sections.'); return; }
      list?.insertAdjacentHTML('beforeend', articleSectionRow({}, list.children.length, list.children.length + 1));
      refreshInsightRowOrder();
      list?.lastElementChild?.querySelector('[data-article-heading]')?.focus();
    } else if (removeArticleSection) {
      const list = $('#insight-section-list');
      if (list?.children.length <= 1) { toast('Keep at least one article section.'); return; }
      removeArticleSection.closest('[data-article-section]')?.remove();
      refreshInsightRowOrder();
    } else if (moveArticleSection) {
      const row = moveArticleSection.closest('[data-article-section]');
      if (moveArticleSection.dataset.articleMove === 'up' && row.previousElementSibling) row.parentNode.insertBefore(row, row.previousElementSibling);
      if (moveArticleSection.dataset.articleMove === 'down' && row.nextElementSibling) row.parentNode.insertBefore(row.nextElementSibling, row);
      refreshInsightRowOrder();
    } else if (removeGalleryPhoto) {
      removeGalleryPhoto.closest('[data-gallery-image]')?.remove();
      refreshInsightRowOrder();
    } else if (moveGalleryPhoto) {
      const row = moveGalleryPhoto.closest('[data-gallery-image]');
      if (moveGalleryPhoto.dataset.galleryMove === 'up' && row.previousElementSibling) row.parentNode.insertBefore(row, row.previousElementSibling);
      if (moveGalleryPhoto.dataset.galleryMove === 'down' && row.nextElementSibling) row.parentNode.insertBefore(row.nextElementSibling, row);
      refreshInsightRowOrder();
    } else if (addRoleSection) {
      const list = $('#vacancy-role-section-list');
      if (list?.children.length >= 12) { toast('A vacancy can have up to 12 role sections.'); return; }
      list?.insertAdjacentHTML('beforeend', vacancyRoleSectionRow({ heading: '', bullets: [''] }, list.children.length));
      refreshVacancyRoleOrder();
      list?.lastElementChild?.querySelector('[data-role-heading]')?.focus();
    } else if (removeRoleSection) {
      removeRoleSection.closest('[data-role-section]')?.remove();
      refreshVacancyRoleOrder();
    } else if (moveRoleSection) {
      const section = moveRoleSection.closest('[data-role-section]');
      if (moveRoleSection.dataset.roleSectionMove === 'up' && section.previousElementSibling) section.parentNode.insertBefore(section, section.previousElementSibling);
      if (moveRoleSection.dataset.roleSectionMove === 'down' && section.nextElementSibling) section.parentNode.insertBefore(section.nextElementSibling, section);
      refreshVacancyRoleOrder();
    } else if (addRoleBullet) {
      const section = addRoleBullet.closest('[data-role-section]');
      const list = section?.querySelector('[data-role-bullets]');
      if (list?.children.length >= 30) { toast('A role section can have up to 30 bullet points.'); return; }
      const heading = section?.querySelector('[data-role-heading]')?.value.trim().toLowerCase() || '';
      const placeholder = /responsibilit|what you will do/.test(heading) ? 'Add a key responsibility' : /^skills?$/.test(heading) ? 'Add a relevant skill' : /qualifications?/.test(heading) ? 'Add a required qualification' : 'Add one clear point';
      list?.insertAdjacentHTML('beforeend', `<div class="program-list-row vacancy-role-bullet"><label class="insight-builder-field"><span>Bullet point</span><input data-role-bullet maxlength="500" placeholder="${escapeHtml(placeholder)}"></label><button class="program-list-remove" type="button" data-role-bullet-remove>Remove</button></div>`);
      refreshVacancyRoleOrder();
      list?.lastElementChild?.querySelector('[data-role-bullet]')?.focus();
    } else if (removeRoleBullet) {
      removeRoleBullet.closest('.vacancy-role-bullet')?.remove();
      refreshVacancyRoleOrder();
    } else if (removeReport) {
      draftPayload.downloadUrl = ''; draftPayload.downloadLabel = ''; draftPayload.reportFileName = '';
      $('#report-preview').innerHTML = '';
    } else if (addButton) {
      const name = addButton.dataset.programAdd;
      const rows = addButton.closest('[data-program-list]')?.querySelector('.program-list-items');
      if (!programListNames.includes(name) || !rows) return;
      rows.insertAdjacentHTML('beforeend', programListRow(name, addButton.dataset.label || 'List item', '', rows.children.length));
      rows.lastElementChild?.querySelector('input')?.focus();
    } else if (removeButton) {
      removeButton.closest('.program-list-row')?.remove();
    }
    readForm(); $('#editor-checklist').innerHTML = checklistMarkup(); queueEditorAutosave();
  });
  $('#editor-checklist').addEventListener('click', event => { const card = event.target.closest('.side-help'); if (!card) return; const target = $('#content-editor')?.elements.namedItem(card.dataset.field) || document.getElementById(card.dataset.field); const focusTarget = target?.querySelector?.('textarea, input, button') || target; focusTarget?.focus?.(); target?.scrollIntoView({ behavior: 'smooth', block: 'center' }); });
  $('#cover-upload')?.addEventListener('change', event => uploadFile(event.target.files[0], 'image'));
  $('#report-upload')?.addEventListener('change', event => uploadFile(event.target.files[0], 'report'));
  $('#gallery-upload')?.addEventListener('change', event => uploadGalleryImages(event.target.files));
  $('#program-google-link-test')?.addEventListener('click', () => {
    const input = $('[name="googleFormUrl"]');
    let url;
    try { url = new URL(input.value.trim()); } catch { url = null; }
    const valid = url && url.protocol === 'https:' && ((url.hostname === 'docs.google.com' && url.pathname.includes('/forms/')) || (url.hostname === 'forms.gle' && url.pathname.length > 1));
    const status = $('#program-google-link-status');
    if (!valid) { status.textContent = 'Enter a Google Forms link first.'; status.dataset.state = 'error'; input.focus(); return; }
    status.textContent = 'Link is valid. Opening Google Forms in a new tab.'; status.dataset.state = 'success';
    window.open(url.toString(), '_blank', 'noopener,noreferrer');
  });
}
function readForm() {
  const form = $('#content-editor'); if (!form) return;
  const values = Object.fromEntries(new FormData(form));
  for (const key of ['cover-upload', 'gallery-upload', 'report-upload']) delete values[key];
  draftPayload = { ...draftPayload, ...values };
  if (draftPayload.type === 'program') for (const key of programListNames) {
    const list = form.querySelector(`[data-program-list="${key}"]`);
    if (list) draftPayload[key] = [...list.querySelectorAll(`[data-program-item="${key}"]`)].map(input => input.value.trim()).filter(Boolean);
  }
  if (draftPayload.type === 'publication') {
    const sections = [...form.querySelectorAll('[data-article-section]')].map(row => ({ heading: row.querySelector('[data-article-heading]')?.value.trim() || '', body: row.querySelector('[data-article-body]')?.value.trim() || '' })).filter(section => section.heading || section.body);
    draftPayload.articleSections = sections;
    draftPayload.articleStructureVersion = 1;
    draftPayload.content = sections.map(section => [section.heading ? `## ${section.heading}` : '', section.body].filter(Boolean).join('\n')).join('\n\n').slice(0, 60000);
    draftPayload.galleryImages = [...form.querySelectorAll('[data-gallery-image]')].map(row => ({ image: row.dataset.image || '', alt: row.querySelector('[data-gallery-alt]')?.value.trim() || '', caption: row.querySelector('[data-gallery-caption]')?.value.trim() || '' })).filter(photo => photo.image);
    if (draftPayload.downloadUrl) draftPayload.downloadLabel = String(draftPayload.title || '').trim() || 'Download report';
  }
  if (draftPayload.type === 'vacancy') {
    const sections = [...form.querySelectorAll('[data-role-section]')].map(section => ({
      heading: section.querySelector('[data-role-heading]')?.value.trim() || '',
      bullets: [...section.querySelectorAll('[data-role-bullet]')].map(input => input.value.trim()).filter(Boolean),
    })).filter(section => section.heading || section.bullets.length);
    draftPayload.roleSections = sections;
    draftPayload.roleStructureVersion = 2;
    draftPayload.responsibilities = sections.filter(section => /^(responsibilities|key responsibilities|what you will do)$/i.test(section.heading)).flatMap(section => section.bullets);
    draftPayload.skills = sections.filter(section => /^(skills|key skills|technical skills|requirements|what you bring)$/i.test(section.heading)).flatMap(section => section.bullets);
    draftPayload.qualifications = sections.filter(section => /^(qualifications|education and qualifications|education requirements)$/i.test(section.heading)).flatMap(section => section.bullets);
  }
  if (draftPayload.type === 'event') draftPayload.galleryImages = [...form.querySelectorAll('[data-gallery-image]')].map(row => ({ image: row.dataset.image || '', alt: row.querySelector('[data-gallery-alt]')?.value.trim() || '', caption: row.querySelector('[data-gallery-caption]')?.value.trim() || '' })).filter(photo => photo.image);
  for (const key of ['postedAt', 'closesAt', 'startsAt', 'endsAt', 'publishAt']) if (values[key]) draftPayload[key] = draftPayload.type === 'event' && ['startsAt', 'endsAt'].includes(key) ? kigaliDateValue(values[key]) : new Date(values[key]).toISOString(); else if (key in values) draftPayload[key] = '';
  if (draftPayload.type === 'event') draftPayload.activityState = eventActivityState(draftPayload);
  if (values.status === 'published' && !draftPayload.publishAt) draftPayload.publishAt = new Date().toISOString();
  if (values.status === 'draft') draftPayload.publishAt = '';
}
async function uploadFile(file, kind) {
  if (!file) return;
  if (file.size > 3 * 1024 * 1024) { toast('Choose a file that is 3 MB or smaller.', true); return; }
  const form = new FormData(); form.append('file', file);
  try {
    const data = await api('/api/cms/upload', { method: 'POST', body: form });
    if (kind === 'image') { draftPayload.image = data.url; draftPayload.imageAlt ||= file.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' '); draftPayload.imageAlt = draftPayload.imageAlt; $('#image-preview').innerHTML = `<div class="upload-preview"><img src="${escapeHtml(data.url)}" alt=""><span>${escapeHtml(file.name)}<br><small>Ready to publish</small></span></div>`; const alt = $('[name="imageAlt"]'); if (alt && !alt.value) alt.value = draftPayload.imageAlt; }
    else {
      draftPayload.downloadUrl = data.url; draftPayload.reportFileName = file.name;
      draftPayload.downloadLabel = String(draftPayload.title || '').trim() || 'Download report';
      $('#report-preview').innerHTML = `<div class="insight-file-attached"><span><b>${escapeHtml(file.name)}</b><small>Ready to publish</small></span><span class="insight-file-actions"><a href="${escapeHtml(data.url)}" target="_blank" rel="noopener noreferrer">Preview</a><button type="button" data-remove-report>Remove</button></span></div>`;
    }
    $('#editor-checklist').innerHTML = checklistMarkup(); queueEditorAutosave();
    toast('File uploaded securely.');
  } catch (error) { toast(error.message, true); }
}
async function uploadGalleryImages(files) {
  const input = $('#gallery-upload');
  const selected = [...(files || [])];
  if (!selected.length) return;
  if (selected.some(file => file.size > 3 * 1024 * 1024)) { toast('Each photo must be 3 MB or smaller.', true); if (input) input.value = ''; return; }
  if ((draftPayload.galleryImages?.length || 0) + selected.length > 20) { toast(`Add up to 20 supporting photos to one ${draftPayload.type === 'event' ? 'activity' : 'Insight'}.`, true); if (input) input.value = ''; return; }
  if (input) input.disabled = true;
  const status = $('#insight-gallery-status');
  let uploaded = 0;
  try {
    for (const file of selected) {
      if (status) status.textContent = `Uploading photo ${uploaded + 1} of ${selected.length}...`;
      const form = new FormData(); form.append('file', file);
      const data = await api('/api/cms/upload', { method: 'POST', body: form });
      draftPayload.galleryImages ||= [];
      draftPayload.galleryImages.push({ image: data.url, alt: file.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' '), caption: '' });
      uploaded += 1;
    }
    $('#insight-gallery-list').innerHTML = draftPayload.galleryImages.map((photo, index) => galleryImageRow(photo, index, draftPayload.galleryImages.length)).join('');
    refreshInsightRowOrder();
    readForm(); $('#editor-checklist').innerHTML = checklistMarkup(); queueEditorAutosave();
    if (status) status.textContent = `${uploaded} supporting photo${uploaded === 1 ? '' : 's'} added.`;
    toast(`${uploaded} supporting photo${uploaded === 1 ? '' : 's'} added.`);
  } catch (error) {
    if (uploaded) { $('#insight-gallery-list').innerHTML = draftPayload.galleryImages.map((photo, index) => galleryImageRow(photo, index, draftPayload.galleryImages.length)).join(''); refreshInsightRowOrder(); readForm(); queueEditorAutosave(); }
    if (status) status.textContent = uploaded ? `${uploaded} photo${uploaded === 1 ? '' : 's'} added. One file could not be uploaded.` : 'The photos could not be uploaded.';
    toast(uploaded ? `${uploaded} photo${uploaded === 1 ? '' : 's'} added. One file could not be uploaded.` : error.message, true);
  } finally { if (input) { input.disabled = false; input.value = ''; } }
}
async function init() {
  let authenticated = false;
  try {
    const data = await api('/api/cms/me'); adminUser = data.user; authenticated = true;
    const availableSections = new Set(['overview', 'applications', 'trash', ...Object.keys(types)]);
    try { const savedSection = sessionStorage.getItem('irona-admin-active-section'); if (availableSections.has(savedSection)) activeSection = savedSection; } catch { /* Open Overview if browser storage is unavailable. */ }
    await loadWorkspace();
  }
  catch (error) { if (authenticated) renderWorkspaceLoadError(adminRequestError(error)); else renderLogin(); await hideAdminTransition(); }
}
init();





