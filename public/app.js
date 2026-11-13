const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const authModal = $('#auth-modal');
const dashboardModal = $('#dashboard-modal');
let currentUser = null;
let allOpportunities = [];
let activeFilter = document.body.classList.contains('careers-page') ? 'job' : document.body.classList.contains('programs-page') ? 'program' : 'all';
let toastTimer;

async function api(url, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body && !(options.body instanceof FormData)) headers['Content-Type'] = 'application/json';
  const response = await fetch(url, { credentials: 'same-origin', ...options, headers });
  const data = response.headers.get('content-type')?.includes('application/json') ? await response.json() : null;
  if (!response.ok) { const error = new Error(data?.error || 'Something went wrong. Please try again.'); error.status = response.status; throw error; }
  return data;
}
function showToast(message) {
  const toast = $('#toast'); toast.textContent = message; toast.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove('show'), 3800);
}
function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function cleanEditorialTitle(value = '') { return String(value).replace(/\s+([,.;:!?])/g, '$1').replace(/\s+/g, ' ').trim(); }
function dateKeyInKigali(date) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Kigali', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}
function prettyDate(date) { if (!date) return 'Not specified'; const value = String(date); const parsed = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00Z` : value); return Number.isNaN(parsed.getTime()) ? 'Not specified' : new Intl.DateTimeFormat('en', { timeZone: 'Africa/Kigali', day: 'numeric', month: 'long', year: 'numeric' }).format(parsed); }
function eventState(item, now = Date.now()) { const value = item.endsAt || item.startsAt; const time = value ? new Date(value).getTime() : NaN; return Number.isFinite(time) && time < now ? 'completed' : 'upcoming'; }
function eventTime(date) { if (!date) return ''; const value = new Date(date); return Number.isNaN(value.getTime()) ? '' : new Intl.DateTimeFormat('en', { timeZone: 'Africa/Kigali', hour: 'numeric', minute: '2-digit', hour12: true }).format(value); }
function eventDateRange(item) { const start = item.startsAt; const end = item.endsAt; if (!start) return 'Date to be announced'; const sameDay = end && dateKeyInKigali(new Date(start)) === dateKeyInKigali(new Date(end)); const date = prettyDate(start); const startTime = eventTime(start); if (!end) return `${date}${startTime ? ` · ${startTime}` : ''}`; if (sameDay) return `${date} · ${startTime}–${eventTime(end)}`; return `${date}${startTime ? ` · ${startTime}` : ''} to ${prettyDate(end)}${eventTime(end) ? ` · ${eventTime(end)}` : ''}`; }
const eventCalendarIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></svg>';
const eventPinIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></svg>';
function countdown(date) {
  const remaining = new Date(date).getTime() - Date.now();
  if (!date || !Number.isFinite(remaining) || remaining < 0) return 'Closed';
  const days = Math.floor(remaining / 86400000);
  const hours = Math.floor((remaining % 86400000) / 3600000);
  if (days === 0 && hours === 0) return 'Closes in under an hour';
  if (days === 0) return `Closes in ${hours} hour${hours === 1 ? '' : 's'}`;
  return `${days} day${days === 1 ? '' : 's'}, ${hours} hour${hours === 1 ? '' : 's'} left`;
}
function labelType(type) { return ({ job: 'Vacancy', program: 'Program', consultancy: 'Consultancy' })[type] || 'Opportunity'; }

async function loadEditorialCards() {
  const grid = $('[data-content-grid]');
  if (!grid) return;
  const type = grid.dataset.contentGrid;
  const emptyText = type === 'event' ? 'IRONA activities and events will appear here.' : 'IRONA research, reports and stories will appear here.';
  try {
    const data = await api(`/api/content?type=${encodeURIComponent(type)}`);
    const items = (data.content || []).map(item => item.type === 'news' ? { ...item, type: 'publication' } : item);
    if (!items.length) { grid.innerHTML = `<p class="public-empty-compact">${escapeHtml(emptyText)}</p>`; return; }
    if (type === 'event') {
      const upcoming = items.filter(item => eventState(item) === 'upcoming').sort((a, b) => new Date(a.startsAt || 0) - new Date(b.startsAt || 0));
      const completed = items.filter(item => eventState(item) === 'completed').sort((a, b) => new Date(b.endsAt || b.startsAt || 0) - new Date(a.endsAt || a.startsAt || 0));
      const renderCards = group => group.map(item => {
        const state = eventState(item);
        const link = `/content.html?id=${encodeURIComponent(item.id)}`;
        const place = item.venue || item.location || '';
        const dateRange = eventDateRange(item);
        const typeLabel = item.activityType || 'Activity';
        const summary = item.summary || String(item.content || '').replace(/^#+\s*/gm, '').replace(/[*_`>-]/g, '').trim().slice(0, 260);
        return `<article class="public-story-card public-event-card"><a class="story-image-wrap" href="${link}" aria-label="View ${escapeHtml(cleanEditorialTitle(item.title))}"><img class="story-image" src="${escapeHtml(item.image || '/assets/blue-celebrating-15-years-impact.png')}" alt="${escapeHtml(item.imageAlt || '')}" loading="lazy"><span class="event-status-badge ${state}"><i aria-hidden="true"></i>${state === 'upcoming' ? 'Upcoming' : 'Completed'}</span></a><div class="story-copy"><span class="event-card-type">${escapeHtml(typeLabel)}</span><h3><a href="${link}">${escapeHtml(cleanEditorialTitle(item.title))}</a></h3><p>${escapeHtml(summary)}</p><div class="event-card-meta"><span class="event-card-date"><b aria-hidden="true">${eventCalendarIcon}</b><span>${escapeHtml(dateRange)}</span></span>${place ? `<span class="event-card-place"><b aria-hidden="true">${eventPinIcon}</b><span>${escapeHtml(place)}</span></span>` : ''}</div><div class="story-foot"><span>${state === 'upcoming' ? 'Join us' : 'Activity record'}</span><a href="${link}">View activity <b aria-hidden="true">&#8594;</b></a></div></div></article>`;
      }).join('');
      grid.classList.add('event-directory-grid');
      grid.innerHTML = `<div class="event-card-grid">${renderCards(upcoming)}${renderCards(completed)}</div>`;
      grid.querySelectorAll('.public-event-card .story-image').forEach(image => {
        const preservePoster = () => { if (image.naturalHeight > image.naturalWidth * 1.08) image.closest('.story-image-wrap')?.classList.add('poster-cover'); };
        if (image.complete) preservePoster(); else image.addEventListener('load', preservePoster, { once: true });
      });
      return;
    }
    grid.innerHTML = items.map(item => {
      const date = item.type === 'event' ? item.startsAt : item.publishAt || item.createdAt;
      const text = item.summary || String(item.content || '').replace(/^#+\s*/gm, '').replace(/[*_`>-]/g, '').trim().slice(0, 300);
      const detail = item.type === 'event' ? (item.activityState === 'completed' ? 'Activity completed' : 'Upcoming activity') : `${Math.max(1, item.readingTime || 1)} min read`;
      const tag = item.type === 'event' ? (item.activityType || item.category || 'Activity') : (item.category || 'Insight');
      const eventPlace = item.type === 'event' ? (item.venue || item.location || '') : '';
      const actionLabel = item.type === 'event' ? 'View activity' : 'View insight';
      const action = actionLabel;
      return `<article class="public-story-card ${item.type === 'event' ? 'public-event-card' : 'public-insight-card'}"><a class="story-image-wrap" href="/content.html?id=${encodeURIComponent(item.id)}" aria-label="${actionLabel}: ${escapeHtml(item.title)}"><img class="story-image" src="${escapeHtml(item.image || '/assets/blue-celebrating-15-years-impact.png')}" alt="${escapeHtml(item.imageAlt || '')}" loading="lazy"></a><div class="story-copy"><div class="story-kicker"><span>${escapeHtml(tag)}</span><span>${escapeHtml(prettyDate(date))}</span></div><h2><a href="/content.html?id=${encodeURIComponent(item.id)}">${escapeHtml(item.title)}</a></h2><p>${escapeHtml(text)}</p>${eventPlace ? `<span class="story-place">${escapeHtml(eventPlace)}</span>` : ''}<div class="story-foot"><span>${escapeHtml(detail)}</span><a href="/content.html?id=${encodeURIComponent(item.id)}">${action} <b aria-hidden="true">&#8594;</b></a></div></div></article>`;
    }).join('');
  } catch {
    grid.innerHTML = '<p class="public-empty-compact">Content is temporarily unavailable. Please come back shortly.</p>';
  }
}
async function loadOpportunities() {
  if (!document.querySelector('#opportunity-list')) return;
  const listingType = document.body.classList.contains('careers-page') ? 'vacancy' : 'program';
  const listingKey = `irona-opportunity-list:${listingType}`;
  try {
    const data = await api(listingType === 'vacancy' ? '/api/public-vacancies' : '/api/public-programs');
    allOpportunities = data.opportunities || [];
    try {
      localStorage.setItem(listingKey, JSON.stringify(allOpportunities));
      allOpportunities.forEach(item => localStorage.setItem(`irona-opportunity:${item.id}`, JSON.stringify(item)));
    } catch { /* The public listing remains usable if browser storage is unavailable. */ }
    renderOpportunities();
  } catch (error) {
    try { allOpportunities = JSON.parse(localStorage.getItem(listingKey) || '[]'); } catch { allOpportunities = []; }
    if (allOpportunities.length) renderOpportunities();
    else $('#opportunity-list').innerHTML = `<div class="opportunity-empty">${escapeHtml(error.message || 'Opportunities will appear here when the portal is connected.')}</div>`;
  }
}
function renderOpportunities() {
  const list = $('#opportunity-list');
  if (!list) return;
  const filtered = allOpportunities.filter(o => activeFilter === 'all' || o.type === activeFilter);
  if (activeFilter === 'job') {
    if (!filtered.length) { list.innerHTML = '<div class="opportunity-empty">There are no vacancies listed right now.</div>'; return; }
    list.innerHTML = filtered.map(item => `<article class="opportunity-row"><div class="opportunity-primary"><span class="opportunity-kind">VACANCY${item.isOpen ? '' : ' · CLOSED'}</span><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.summary || '')}</p></div><div class="opportunity-meta opportunity-location"><span class="listing-meta-label">LOCATION</span><b>${escapeHtml(item.location || 'Rwanda')}</b></div><div class="opportunity-meta opportunity-deadline"><span class="listing-meta-label">${item.isOpen ? 'APPLICATION DEADLINE' : 'STATUS'}</span><b class="deadline">${item.isOpen ? (item.closesAt ? escapeHtml(prettyDate(item.closesAt)) : 'Open') : 'Applications closed'}</b>${item.isOpen && item.closesAt ? `<small>${escapeHtml(countdown(item.closesAt))}</small>` : ''}</div><a class="opportunity-button" href="/opportunity.html?type=vacancy&id=${encodeURIComponent(item.id)}">${item.isOpen ? 'View vacancy' : 'View details'} <span aria-hidden="true">&#8594;</span></a></article>`).join('');
    return;
  }

  const statusOf = item => item.status || (item.isOpen ? 'open' : 'closed');
  const ordered = [...filtered].sort((a, b) => ({ open: 0, upcoming: 1, closed: 2 }[statusOf(a)] ?? 0) - ({ open: 0, upcoming: 1, closed: 2 }[statusOf(b)] ?? 0) || new Date(b.postedAt || 0) - new Date(a.postedAt || 0));
  const makeProgramCards = items => items.map(item => {
    const status = statusOf(item);
    const statusLabel = status === 'upcoming' ? 'Upcoming' : status === 'closed' ? 'Closed' : 'Open';
    const applicationText = status === 'closed' ? 'Closed' : status === 'upcoming' ? (item.opensAt ? `Opens ${prettyDate(item.opensAt)}` : 'Opening soon') : item.closesAt ? `Closes ${prettyDate(item.closesAt)}` : 'Open';
    const href = `/opportunity.html?type=program&id=${encodeURIComponent(item.id)}`;
    const image = item.image ? `<img class="story-image" src="${escapeHtml(item.image)}" alt="${escapeHtml(item.imageAlt || '')}" loading="lazy">` : '<span class="program-card-image-placeholder" aria-hidden="true">IRONA PROGRAM</span>';
    const location = String(item.location || '').trim();
    return `<article class="public-story-card public-program-card"><a class="story-image-wrap" href="${href}" aria-label="View ${escapeHtml(cleanEditorialTitle(item.title))}">${image}<span class="event-status-badge ${status}"><i aria-hidden="true"></i>${statusLabel}</span></a><div class="story-copy"><div class="story-kicker"><span>PROGRAM</span><span>${escapeHtml(applicationText)}</span></div><h2><a href="${href}">${escapeHtml(cleanEditorialTitle(item.title))}</a></h2>${String(item.summary || '').trim() ? `<p>${escapeHtml(item.summary.trim())}</p>` : ''}${location ? `<span class="story-place">${escapeHtml(location)}</span>` : ''}<div class="story-foot"><span>${status === 'open' ? 'Applications open' : statusLabel}</span><a href="${href}">View program <b aria-hidden="true">&#8594;</b></a></div></div></article>`;
  }).join('');
  list.innerHTML = ordered.length ? `<div class="program-list-grid">${makeProgramCards(ordered)}</div>` : '<p class="program-list-empty">There are no programs listed right now.</p>';
}

function authView(mode = 'login', notice = '') {
  const register = mode === 'register';
  $('#auth-content').innerHTML = `<span class="eyebrow">${register ? 'CREATE YOUR APPLICANT PROFILE' : 'WELCOME BACK'}</span>
    <h2>${register ? 'Start your next chapter.' : 'Sign in to IRONA.'}</h2><p>${register ? 'Save time when applying and follow your applications in one place.' : 'Access your applicant or staff dashboard.'}</p>
    ${notice ? `<div class="question-help">${escapeHtml(notice)}</div>` : ''}
    <form class="form-stack" id="auth-form">
      ${register ? '<label class="form-field">Full name<input name="name" autocomplete="name" required minlength="2"></label>' : ''}
      <label class="form-field">Email address<input name="email" type="email" autocomplete="email" required></label>
      <label class="form-field">Password<input name="password" type="password" autocomplete="${register ? 'new-password' : 'current-password'}" required minlength="${register ? '10' : '1'}"></label>
      ${register ? '<small class="question-help">Use at least 10 characters. We will never display your password.</small>' : ''}
      <button class="btn btn-primary" type="submit">${register ? 'Create account' : 'Sign in'} <span>↗</span></button>
    </form><div class="auth-switch">${register ? 'Already have an account?' : 'New to IRONA opportunities?'} <button type="button" id="auth-switch">${register ? 'Sign in' : 'Create an account'}</button></div>`;
  $('#auth-switch').onclick = () => authView(register ? 'login' : 'register');
  $('#auth-form').onsubmit = async event => {
    event.preventDefault(); const button = $('button[type=submit]', event.currentTarget); button.disabled = true;
    const body = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const data = await api(register ? '/api/auth/register' : '/api/auth/login', { method: 'POST', body: JSON.stringify(body) });
      currentUser = data.user; authModal.close();
      if (currentUser.role === 'admin') openDashboard('admin'); else openDashboard('applicant');
      updateNav();
    } catch (error) { showToast(error.message); button.disabled = false; }
  };
}
function updateNav() {
  const button = $('[data-open-auth]');
  if (button) { button.textContent = currentUser ? (currentUser.role === 'admin' ? 'Admin dashboard' : 'My dashboard') : 'Sign in'; }
}
function openAuth(mode = 'login', notice = '') { authView(mode, notice); authModal.showModal(); }

function dashHeader(title, description, actions = '') {
  return `<div class="dashboard-head"><div><h2>${title}</h2><p>${description}</p></div><div class="dashboard-actions">${actions}<button class="btn btn-quiet small-btn" data-logout>Sign out</button></div></div>`;
}
function bindLogout() { $('[data-logout]')?.addEventListener('click', async () => { await api('/api/auth/logout', { method: 'POST' }); currentUser = null; updateNav(); dashboardModal.close(); showToast('You are signed out.'); }); }
async function openDashboard(kind) {
  if (!currentUser) { openAuth('login'); return; }
  if (kind === 'admin') await renderAdmin('opportunities'); else await renderApplicant();
  dashboardModal.showModal();
}
async function renderApplicant() {
  const data = await api('/api/applications/mine');
  const notes = data.notifications.length ? `<div class="application-card"><h3>Updates</h3>${data.notifications.map(n => `<p><b>${escapeHtml(n.title)}</b> — ${escapeHtml(n.message)} <span class="question-help">${escapeHtml(prettyDate(n.createdAt))}</span></p>`).join('')}</div>` : '';
  $('#dashboard-content').innerHTML = dashHeader(`Hello, ${escapeHtml(currentUser.name.split(' ')[0])}.`, 'Your applications and messages are here.') + `<div class="dash-tabs"><button class="dash-tab active">My applications</button><button class="dash-tab" id="browse-opps">Browse opportunities</button></div>${notes}${data.applications.length ? `<div class="dash-table-wrap"><table class="dash-table"><thead><tr><th>Opportunity</th><th>Type</th><th>Submitted</th><th>Status</th></tr></thead><tbody>${data.applications.map(a => `<tr><td>${escapeHtml(a.title)}</td><td>${escapeHtml(labelType(a.type))}</td><td>${escapeHtml(prettyDate(a.createdAt))}</td><td><span class="status-pill">${escapeHtml(a.status)}</span></td></tr>`).join('')}</tbody></table></div>` : '<div class="empty-state">You have not submitted an application yet. Explore the open opportunities on this page.</div>'}`;
  bindLogout(); $('#browse-opps').onclick = () => dashboardModal.close();
}
function opportunityForm(o = {}) {
  const reqs = (o.requirements || []).join('\n');
  const questions = (o.questions || []).map(q => q.label).join('\n');
  const localDate = o.closesAt ? new Date(o.closesAt).toISOString().slice(0, 16) : '';
  return `<form id="opportunity-form" class="form-stack"><input type="hidden" name="id" value="${escapeHtml(o.id || '')}"><div class="section-heading" style="margin:0"><div><span class="eyebrow">${o.id ? 'EDIT LISTING' : 'NEW LISTING'}</span><h2 style="font-size:32px">${o.id ? 'Update opportunity' : 'Create an opportunity'}</h2></div></div>
    <label class="form-field">Title *<input name="title" required maxlength="150" value="${escapeHtml(o.title || '')}"></label>
    <label class="form-field">Type<select name="type"><option value="job" ${o.type === 'job' ? 'selected' : ''}>Career / job</option><option value="program" ${!o.type || o.type === 'program' ? 'selected' : ''}>Programme</option><option value="consultancy" ${o.type === 'consultancy' ? 'selected' : ''}>Consultancy</option></select></label>
    <label class="form-field">Short summary<input name="summary" maxlength="350" value="${escapeHtml(o.summary || '')}"></label>
    <label class="form-field">Full description<textarea name="description" maxlength="12000">${escapeHtml(o.description || '')}</textarea></label>
    <label class="form-field">Location<input name="location" value="${escapeHtml(o.location || 'Rwanda')}"></label>
    <label class="form-field">Closing date and time *<input name="closesAt" type="datetime-local" required value="${escapeHtml(localDate)}"></label>
    <label class="form-field">Requirements (one per line)<textarea name="requirements">${escapeHtml(reqs)}</textarea></label>
    <label class="form-field">Additional application questions (one per line)<textarea name="questions" placeholder="For example: Describe your experience with cooperative development">${escapeHtml(questions)}</textarea><small class="question-help">Applicants answer each question in a text field.</small></label>
    <label class="form-field">Publishing status<select name="status"><option value="open" ${!o.status || o.status === 'open' ? 'selected' : ''}>Open for applications</option><option value="draft" ${o.status === 'draft' ? 'selected' : ''}>Save as draft</option><option value="closed" ${o.status === 'closed' ? 'selected' : ''}>Closed</option></select></label>
    <div class="dashboard-actions"><button class="btn btn-primary" type="submit">${o.id ? 'Save changes' : 'Create listing'} <span>↗</span></button><button class="btn btn-quiet" type="button" id="cancel-edit">Cancel</button></div></form>`;
}
async function renderAdmin(tab = 'opportunities', editing = null) {
  const [oData, aData] = await Promise.all([api('/api/opportunities?admin=1'), api('/api/admin/applications')]);
  allOpportunities = oData.opportunities || [];
  const countOpen = allOpportunities.filter(o => o.isOpen).length;
  const actionButtons = `<button class="btn btn-primary small-btn" id="new-opportunity">+ New opportunity</button><button class="btn btn-quiet small-btn" id="new-staff">Add staff</button>`;
  if (editing !== null) {
    $('#dashboard-content').innerHTML = dashHeader('IRONA staff workspace', 'Manage opportunities and applications.', actionButtons) + opportunityForm(editing || {});
    bindLogout();
    $('#new-opportunity').onclick = () => renderAdmin('opportunities', null);
    $('#new-staff').onclick = addStaff;
    $('#cancel-edit').onclick = () => renderAdmin('opportunities');
    $('#opportunity-form').onsubmit = async event => {
      event.preventDefault(); const form = event.currentTarget; const f = new FormData(form);
      const body = Object.fromEntries(f); body.requirements = String(body.requirements).split('\n').map(x => x.trim()).filter(Boolean); body.questions = String(body.questions).split('\n').map((label, i) => ({ id: `q${i + 1}`, label: label.trim(), required: true })).filter(q => q.label);
      body.closesAt = new Date(body.closesAt).toISOString();
      try { await api(body.id ? `/api/opportunities/${body.id}` : '/api/opportunities', { method: body.id ? 'PUT' : 'POST', body: JSON.stringify(body) }); showToast('Opportunity saved.'); renderAdmin('opportunities'); }
      catch (error) { showToast(error.message); }
    };
    return;
  }
  const listings = allOpportunities.length ? `<div class="dash-table-wrap"><table class="dash-table"><thead><tr><th>Opportunity</th><th>Type</th><th>Deadline</th><th>Status</th><th>Manage</th></tr></thead><tbody>${allOpportunities.map(o => `<tr><td><b>${escapeHtml(o.title)}</b><br><span class="question-help">${escapeHtml(o.location || '')}</span></td><td>${escapeHtml(labelType(o.type))}</td><td>${escapeHtml(prettyDate(o.closesAt))}<br>${escapeHtml(countdown(o.closesAt))}</td><td><span class="status-pill ${o.isOpen ? '' : 'closed'}">${escapeHtml(o.status || (o.isOpen ? 'open' : 'closed'))}</span></td><td>${o.source === 'cms' ? '<a class="dash-actions" href="/admin.html">Manage in Publishing</a>' : `<div class="dash-actions"><button data-edit="${escapeHtml(o.id)}">Edit</button><button data-toggle="${escapeHtml(o.id)}" data-status="${o.isOpen ? 'closed' : 'open'}">${o.isOpen ? 'Close applications' : 'Reopen'}</button><button data-delete="${escapeHtml(o.id)}">Delete</button></div>`}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty-state">No opportunities yet. Create the first listing.</div>';
  const applicantRows = aData.applications.length ? `<div class="dash-table-wrap"><table class="dash-table"><thead><tr><th>Applicant</th><th>Opportunity</th><th>Received</th><th>Status / response</th><th>Details</th></tr></thead><tbody>${aData.applications.map(a => `<tr><td><b>${escapeHtml(a.applicant)}</b><br><a href="mailto:${escapeHtml(a.email)}">${escapeHtml(a.email)}</a></td><td>${escapeHtml(a.title)}</td><td>${escapeHtml(prettyDate(a.createdAt))}</td><td><select class="app-status" data-app="${escapeHtml(a.id)}">${['Received', 'Under review', 'Shortlisted', 'Next step', 'Not selected'].map(s => `<option ${s === a.status ? 'selected' : ''}>${s}</option>`).join('')}</select><textarea class="app-note" data-note="${escapeHtml(a.id)}" placeholder="Internal note">${escapeHtml(a.notes || '')}</textarea><button class="save-app" data-save="${escapeHtml(a.id)}">Save update</button></td><td>${Object.entries(a.answers || {}).map(([key, value]) => `<p><b>${escapeHtml(key === 'coverLetter' ? 'Introduction' : key)}:</b> ${escapeHtml(value)}</p>`).join('')}${a.cv ? `<button data-file="${escapeHtml(a.id)}">Download ${escapeHtml(a.cv.originalName)}</button>` : ''}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty-state">No applications received yet.</div>';
  $('#dashboard-content').innerHTML = dashHeader('IRONA staff workspace', `${countOpen} open opportunity${countOpen === 1 ? '' : 'ies'} · ${aData.applications.length} application${aData.applications.length === 1 ? '' : 's'}`, actionButtons) + `<div class="dash-tabs"><button class="dash-tab ${tab === 'opportunities' ? 'active' : ''}" data-tab="opportunities">Opportunities (${allOpportunities.length})</button><button class="dash-tab ${tab === 'applications' ? 'active' : ''}" data-tab="applications">Applications (${aData.applications.length})</button></div>${tab === 'applications' ? applicantRows : listings}`;
  bindLogout();
  $('#new-opportunity').onclick = () => renderAdmin('opportunities', {}); $('#new-staff').onclick = addStaff;
  $$('[data-tab]').forEach(b => b.onclick = () => renderAdmin(b.dataset.tab));
  $$('[data-edit]').forEach(b => b.onclick = () => renderAdmin('opportunities', allOpportunities.find(o => o.id === b.dataset.edit)));
  $$('[data-toggle]').forEach(b => b.onclick = async () => {
    const o = allOpportunities.find(x => x.id === b.dataset.toggle); if (!o) return;
    try { await api(`/api/opportunities/${o.id}`, { method: 'PUT', body: JSON.stringify({ ...o, status: b.dataset.status }) }); showToast(`Applications ${b.dataset.status === 'closed' ? 'closed' : 'reopened'}.`); renderAdmin(tab); }
    catch (e) { showToast(e.message); }
  });
  $$('[data-delete]').forEach(b => b.onclick = async () => {
    const o = allOpportunities.find(x => x.id === b.dataset.delete); if (!o || !confirm(`Remove “${o.title}”? Existing applications are kept and the listing will be archived.`)) return;
    try { const result = await api(`/api/opportunities/${o.id}`, { method: 'DELETE' }); showToast(result.message || 'Opportunity removed.'); renderAdmin('opportunities'); }
    catch (e) { showToast(e.message); }
  });
  $$('[data-save]').forEach(b => b.onclick = async () => {
    const appId = b.dataset.save; const status = $(`[data-app="${appId}"]`).value; const notes = $(`[data-note="${appId}"]`).value;
    try { await api(`/api/admin/applications/${appId}`, { method: 'PATCH', body: JSON.stringify({ status, notes }) }); showToast('Application updated. The applicant can see the new status in their dashboard.'); }
    catch (e) { showToast(e.message); }
  });
  $$('[data-file]').forEach(b => b.onclick = async () => {
    try { const response = await fetch(`/api/admin/files/${b.dataset.file}`, { credentials: 'same-origin' }); if (!response.ok) throw new Error('Could not download file.'); const blob = await response.blob(); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = 'application-document'; link.click(); URL.revokeObjectURL(url); }
    catch (e) { showToast(e.message); }
  });
}
async function addStaff() {
  $('#dashboard-content').innerHTML = dashHeader('Add an IRONA staff account', 'Create a login for an authorized administrator.') + `<form class="form-stack" id="staff-form"><label class="form-field">Full name<input name="name" required></label><label class="form-field">Work email<input type="email" name="email" required></label><label class="form-field">Temporary password<input type="password" name="password" minlength="12" required><small class="question-help">At least 12 characters. Share it securely with an authorized IRONA staff member.</small></label><div class="dashboard-actions"><button class="btn btn-primary" type="submit">Create staff access</button><button class="btn btn-quiet" type="button" id="cancel-staff">Cancel</button></div></form>`;
  bindLogout(); $('#cancel-staff').onclick = () => renderAdmin();
  $('#staff-form').onsubmit = async e => { e.preventDefault(); try { await api('/api/admin/users', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(e.currentTarget))) }); showToast('Staff account created.'); renderAdmin(); } catch (error) { showToast(error.message); } };
}

function opportunityEndpoint(type, id) {
  return `/api/${type === 'vacancy' ? 'public-vacancies' : 'public-programs'}/${encodeURIComponent(id)}`;
}
function opportunityPageType() {
  const value = new URLSearchParams(location.search).get('type');
  return value === 'vacancy' ? 'vacancy' : 'program';
}
function textAsParagraphs(value = '') {
  const lines = String(value).split(/\r?\n/).map(line => line.trim());
  if (!lines.some(Boolean)) return '<p>Program details will be shared soon.</p>';
  const isHeading = line => /^#{1,3}\s/.test(line) || (line.length > 0 && line.length < 76 && !/[.!;,]$/.test(line) && (/\?$/.test(line) || /^[A-Z][\w'’&()/-]*(?:\s+[A-Z][\w'’&()/-]*){0,8}$/.test(line)));
  const renderLines = (sectionLines, listSection) => {
    const clean = sectionLines.filter(Boolean);
    if (!clean.length) return '';
    const explicit = clean.every(line => /^\s*(?:[-*•]|\d+[.)])\s+/.test(line));
    if (listSection || explicit) return `<ul>${clean.map(line => `<li>${escapeHtml(line.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, ''))}</li>`).join('')}</ul>`;
    const paragraphs = [];
    let current = [];
    for (const line of clean) { current.push(line.replace(/^#{1,3}\s*/, '')); if (/[.!?]$/.test(line)) { paragraphs.push(current.join(' ')); current = []; } }
    if (current.length) paragraphs.push(current.join(' '));
    return paragraphs.map(paragraph => `<p>${escapeHtml(paragraph)}</p>`).join('');
  };
  const sections = [];
  let heading = '';
  let body = [];
  for (const line of lines) {
    if (isHeading(line)) {
      if (heading || body.some(Boolean)) sections.push({ heading, body });
      heading = line.replace(/^#{1,3}\s*/, ''); body = [];
    } else if (line) body.push(line);
  }
  if (heading || body.some(Boolean)) sections.push({ heading, body });
  return sections.map(section => {
    const title = section.heading.toLowerCase();
    const listSection = /who can apply|eligibility|requirements|documents|value chains|matching rates|what you get|benefits/.test(title);
    return `${section.heading ? `<h3>${escapeHtml(section.heading)}</h3>` : ''}${renderLines(section.body, listSection)}`;
  }).join('') || '<p>Program details will be shared soon.</p>';
}
function plainTextParagraphs(value = '') {
  const paragraphs = String(value || '').trim().split(/\n\s*\n/).map(value => value.trim()).filter(Boolean);
  return paragraphs.map(paragraph => `<p>${paragraph.split(/\r?\n/).map(escapeHtml).join('<br>')}</p>`).join('');
}
function parseLegacyProgramSections(value = '') {
  const aliases = {
    'program overview': 'overview', overview: 'overview',
    'who can apply': 'eligibility', eligibility: 'eligibility', 'eligible applicants': 'eligibility',
    'what the program offers': 'benefits', 'program benefits': 'benefits', benefits: 'benefits',
    'supported value chains': 'valueChains', 'value chains': 'valueChains',
    'grant structure and matching rates': 'grantDetails', 'grant structure & matching rates': 'grantDetails', 'grant structure': 'grantDetails', 'matching rates': 'grantDetails',
    'key application requirements': 'requirements', 'application requirements': 'requirements', 'required documents': 'requirements',
    'how to apply': 'howToApply', 'application steps': 'howToApply',
  };
  const sections = { overview: [] };
  let current = 'overview'; let found = false;
  String(value || '').replace(/\r/g, '').split('\n').forEach(line => {
    const key = line.replace(/^\s*#+\s*/, '').trim().replace(/[?:\\]+$/, '').trim().toLowerCase();
    if (aliases[key]) { current = aliases[key]; sections[current] ||= []; found = true; }
    else sections[current].push(line);
  });
  if (!found) return null;
  const text = key => (sections[key] || []).join('\n').trim();
  const items = key => text(key).split(/\n\s*\n/).map(block => block.split(/\r?\n/).map(line => line.trim()).filter(Boolean).join(' ').replace(/^(?:[-*]|\u2022|\d+[.)])\s*/u, '')).filter(Boolean);
  return { overview: text('overview'), eligibility: items('eligibility'), benefits: items('benefits'), valueChains: items('valueChains'), grantDetails: items('grantDetails'), requirements: items('requirements'), howToApply: text('howToApply') };
}
function renderProgramOpportunity(item) {
  const legacy = parseLegacyProgramSections(item.description || item.summary) || null;
  const status = item.status === 'upcoming' ? 'upcoming' : item.isOpen ? 'open' : 'closed';
  const statusLabel = status === 'upcoming' ? 'Upcoming' : status === 'open' ? 'Open' : 'Closed';
  const applicationWindow = status === 'upcoming'
    ? (item.opensAt ? `Registration opens ${prettyDate(item.opensAt)}` : 'Registration opening soon')
    : status === 'open'
      ? (item.closesAt ? `Applications close ${prettyDate(item.closesAt)}` : 'Applications are open')
      : 'Applications are closed';
  const image = item.image
    ? `<figure class="program-detail-cover-card"><img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.imageAlt || '')}" loading="eager">${String(item.imageCaption || '').trim() ? `<figcaption>${escapeHtml(item.imageCaption.trim())}</figcaption>` : ''}</figure>`
    : '';
  const sections = [];
  const overview = legacy ? legacy.overview : item.description;
  if (String(overview || '').trim()) sections.push(`<section class="program-detail-section"><h2>Program overview</h2><div class="program-detail-prose">${legacy ? plainTextParagraphs(overview) : textAsParagraphs(overview)}</div></section>`);
  const addSection = (title, values, fallback = '') => {
    const entries = (Array.isArray(values) ? values : []).map(value => String(value || '').trim()).filter(Boolean);
    if (entries.length) sections.push(`<section class="program-detail-section"><h2>${escapeHtml(title)}</h2><ul>${entries.map(value => `<li>${escapeHtml(value)}</li>`).join('')}</ul></section>`);
    else if (String(fallback || '').trim()) sections.push(`<section class="program-detail-section"><h2>${escapeHtml(title)}</h2><div class="program-detail-prose">${textAsParagraphs(fallback)}</div></section>`);
  };
  addSection('Who can apply?', item.eligibilityItems?.length ? item.eligibilityItems : legacy?.eligibility, item.eligibility);
  addSection('What the program offers', item.programBenefitsItems?.length ? item.programBenefitsItems : legacy?.benefits, item.programBenefits);
  addSection('Supported value chains', item.supportedValueChains?.length ? item.supportedValueChains : legacy?.valueChains);
  addSection('Grant structure', item.grantDetails?.length ? item.grantDetails : legacy?.grantDetails);
  addSection('Application requirements', item.applicationRequirements?.length ? item.applicationRequirements : legacy?.requirements);
  const documents = (Array.isArray(item.applicationDocuments) ? item.applicationDocuments : []).filter(document => String(document.label || '').trim());
  if (documents.length) sections.push(`<section class="program-detail-section"><h2>Documents to prepare</h2><ul>${documents.map(document => `<li>${escapeHtml(document.label)} <span class="program-document-requirement">${document.required ? 'Required' : 'Optional'}</span></li>`).join('')}</ul></section>`);
  const facts = [
    item.location ? `<div><small>LOCATION</small><b>${escapeHtml(item.location)}</b></div>` : '',
  ].filter(Boolean).join('');
  const action = item.isOpen
    ? `<a class="program-detail-register" href="/apply.html?type=program&id=${encodeURIComponent(item.id)}">Register for this program <span aria-hidden="true">&#8594;</span></a>`
    : `<span class="program-detail-register is-closed">${escapeHtml(status === 'upcoming' ? 'Registration not yet open' : 'Applications are closed')}</span>`;
  return `<article class="program-detail-page"><a class="opportunity-back" href="/programs.html">&larr; Back to programs</a>${image}<header class="program-detail-heading"><div class="program-detail-status ${status}"><i aria-hidden="true"></i>${escapeHtml(statusLabel)}</div><h1>${escapeHtml(item.title)}</h1>${String(item.summary || '').trim() ? `<p>${escapeHtml(item.summary.trim())}</p>` : ''}</header>${facts ? `<div class="program-detail-facts">${facts}</div>` : ''}<div class="program-detail-action"><div><small>APPLICATION WINDOW</small><b>${escapeHtml(applicationWindow)}</b></div>${action}</div><div class="program-detail-sections">${sections.join('')}</div></article>`;
}
function deadlineMarkup(opportunity) {
  if (opportunity.status === 'upcoming') return `<span>Applications open <b>${escapeHtml(prettyDate(opportunity.opensAt))}, Kigali time</b></span><span class="status-pill upcoming">Upcoming</span>`;
  if (!opportunity.closesAt) return `<span>${opportunity.status === 'closed' ? 'Applications closed' : 'Applications open'}</span>`;
  return `<span>Applications close <b>${escapeHtml(prettyDate(opportunity.closesAt))}, Kigali time</b></span>${opportunity.isOpen ? `<span class="countdown">${escapeHtml(countdown(opportunity.closesAt))}</span>` : '<span class="status-pill closed">Applications closed</span>'}`;
}
async function initOpportunityDetail() {
  const root = $('#opportunity-detail');
  if (!root) return;
  const params = new URLSearchParams(location.search);
  const type = opportunityPageType(); const id = params.get('id');
  if (!id) { root.innerHTML = '<div class="article-error"><h1>Program not found</h1><p>Choose a program from the list to view its details.</p><a href="/programs.html">Browse programs</a></div>'; return; }
  try {
    let item;
    try {
      item = (await api(opportunityEndpoint(type, id))).opportunity;
      try { localStorage.setItem(`irona-opportunity:${id}`, JSON.stringify(item)); } catch { /* Detail remains available when local storage is full. */ }
    } catch (error) {
      try { item = JSON.parse(localStorage.getItem(`irona-opportunity:${id}`) || 'null'); } catch { item = null; }
      if (!item) throw error;
    }
    item.isOpen = item.status === 'upcoming' ? false : item.isOpen && (!item.closesAt || new Date(item.closesAt).getTime() >= Date.now());
    document.title = `${item.title} | Irona Consultants`;
    const isJob = item.type === 'job';
    const listingHref = isJob ? '/careers.html' : '/programs.html';
    if (!isJob) { root.classList.add('program-detail-main'); root.innerHTML = renderProgramOpportunity(item); return; }
    const docs = (item.applicationDocuments || []).map(doc => `<li>${escapeHtml(doc.label)}${doc.required ? ' <b>Required</b>' : ' <span>Optional</span>'}</li>`).join('');
    const roleOverview = String(item.description || '').trim();
    const legacyRoleSections = [];
    if (Array.isArray(item.responsibilities) && item.responsibilities.length) legacyRoleSections.push({ heading: 'Responsibilities', bullets: item.responsibilities });
    if (Array.isArray(item.skills) && item.skills.length) legacyRoleSections.push({ heading: 'Skills', bullets: item.skills });
    if (Array.isArray(item.qualifications) && item.qualifications.length) legacyRoleSections.push({ heading: 'Qualifications', bullets: item.qualifications });
    const roleSections = (Array.isArray(item.roleSections) ? item.roleSections : legacyRoleSections).map(section => ({ heading: /^skills and qualifications$/i.test(String(section?.heading || '').trim()) ? 'Skills' : String(section?.heading || '').trim(), bullets: (Array.isArray(section?.bullets) ? section.bullets : []).map(value => String(value || '').trim()).filter(Boolean) })).filter(section => section.bullets.length);
    const roleOverviewMarkup = roleOverview ? `<section><h2>Role overview</h2><div class="detail-body">${plainTextParagraphs(roleOverview)}</div></section>` : '';
    const roleSectionsMarkup = roleSections.map(section => `<section><h2>${escapeHtml(section.heading || 'Role details')}</h2><ul>${section.bullets.map(bullet => `<li>${escapeHtml(bullet)}</li>`).join('')}</ul></section>`).join('');
    root.innerHTML = `<div class="opportunity-detail-band"><div class="wrap"><a class="opportunity-back" href="${listingHref}">← ${isJob ? 'All vacancies' : 'All programs'}</a><span class="opportunity-kind">${isJob ? 'VACANCY' : 'PROGRAM'}</span><h1>${escapeHtml(item.title)}</h1>${String(item.summary || '').trim() ? `<p class="detail-deck">${escapeHtml(item.summary.trim())}</p>` : ''}<div class="opportunity-detail-meta"><span>${escapeHtml(item.location || 'Rwanda')}</span><span>Posted ${escapeHtml(prettyDate(item.postedAt))}</span>${deadlineMarkup(item)}</div>${item.isOpen ? `<a class="btn btn-primary" href="/apply.html?type=${encodeURIComponent(type)}&id=${encodeURIComponent(item.id)}">${isJob ? 'Apply for this role' : 'Register for this program'} <span aria-hidden="true">→</span></a>` : '<span class="btn btn-quiet" aria-disabled="true">Applications are closed</span>'}</div></div><div class="wrap opportunity-detail-layout"><article class="opportunity-article">${isJob ? `${roleOverviewMarkup}${roleSectionsMarkup}` : `<section><h2>About this program</h2><div class="detail-body">${textAsParagraphs(item.description || item.summary)}</div></section>${item.eligibility ? `<section><h2>Who can apply</h2><div class="detail-body">${textAsParagraphs(item.eligibility)}</div></section>` : ''}`}</article><aside class="opportunity-detail-aside"><span class="listing-kicker">${isJob ? 'APPLICATION INFORMATION' : 'PROGRAM INFORMATION'}</span><h2>${isJob ? 'Before you apply' : 'How to apply'}</h2><p>${isJob ? 'Complete the application form and attach the requested documents.' : 'Register with your name, email and phone. After registration, continue to the detailed program form when you are ready.'}</p><h3>${isJob ? 'Documents' : 'Before you continue'}</h3><ul>${isJob ? '<li>CV or résumé <b>Required</b></li>' : `<li>Full name</li><li>Email address</li><li>Phone number</li>${docs}`}</ul><p class="aside-deadline">${deadlineMarkup(item).replace(/<[^>]*>/g, ' ')}</p>${item.isOpen ? `<a class="btn btn-primary" href="/apply.html?type=${encodeURIComponent(type)}&id=${encodeURIComponent(item.id)}">${isJob ? 'Apply for this role' : 'Register for this program'} <span aria-hidden="true">→</span></a>` : ''}</aside></div>`;
    const primaryAction = root.querySelector('.opportunity-detail-band .btn-primary');
    if (primaryAction) primaryAction.innerHTML = `${isJob ? 'Apply for this role' : 'Register for this program'} <span aria-hidden="true">&#8594;</span>`;
    if (!isJob) {
      const legacy = parseLegacyProgramSections(item.description || item.summary) || {};
      const article = root.querySelector('.opportunity-article');
      const existingSections = [...(article?.querySelectorAll(':scope > section') || [])];
      const overview = existingSections[0];
      if (overview) {
        overview.querySelector('h2').textContent = 'Program overview';
        const body = overview.querySelector('.detail-body');
        if (body) body.innerHTML = plainTextParagraphs(legacy ? legacy.overview : (item.description || item.summary));
      }
      existingSections.slice(1).forEach(section => section.remove());
      const addProgramSection = (title, values, fallback = '', ordered = false) => {
        const entries = (Array.isArray(values) ? values : []).map(value => String(value || '').trim()).filter(Boolean);
        if ((!entries.length && !String(fallback || '').trim()) || !article) return;
        const section = document.createElement('section');
        const list = entries.length ? `<${ordered ? 'ol' : 'ul'}>${entries.map(value => `<li>${escapeHtml(value)}</li>`).join('')}</${ordered ? 'ol' : 'ul'}>` : plainTextParagraphs(fallback);
        section.innerHTML = `<h2>${escapeHtml(title)}</h2><div class="detail-body">${list}</div>`;
        article.append(section);
      };
      addProgramSection('Who can apply?', item.eligibilityItems?.length ? item.eligibilityItems : legacy.eligibility, item.eligibility);
      addProgramSection('What the program offers', item.programBenefitsItems?.length ? item.programBenefitsItems : legacy.benefits, item.programBenefits);
      addProgramSection('Supported value chains', item.supportedValueChains?.length ? item.supportedValueChains : legacy.valueChains);
      addProgramSection('Grant structure', item.grantDetails?.length ? item.grantDetails : legacy.grantDetails);
      addProgramSection('Application requirements', item.applicationRequirements?.length ? item.applicationRequirements : legacy.requirements);
      if (String(item.programHowToApply || legacy.howToApply || '').trim()) {
        const section = document.createElement('section');
        section.innerHTML = `<h2>How to apply</h2><div class="detail-body">${plainTextParagraphs(item.programHowToApply || legacy.howToApply)}</div>`;
        article?.append(section);
      }
      const asideHeading = root.querySelector('.opportunity-detail-aside h2');
      if (asideHeading) asideHeading.textContent = 'Registration';
    }
    if (!isJob && item.image) {
      const cover = document.createElement('div');
      cover.className = 'program-detail-cover';
      cover.innerHTML = `<img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.imageAlt || '')}">`;
      root.querySelector('.opportunity-article')?.insertBefore(cover, root.querySelector('.opportunity-article').firstChild);
    }
    if (!isJob) {
      const band = root.querySelector('.opportunity-detail-band');
      const cover = root.querySelector('.program-detail-cover');
      const layout = root.querySelector('.opportunity-detail-layout');
      if (band && layout) {
        const feature = document.createElement('section');
        feature.className = `program-detail-feature${cover ? ' has-flyer' : ''}`;
        if (cover) {
          const photoPanel = document.createElement('div');
          photoPanel.className = 'program-detail-photo-panel';
          cover.remove();
          photoPanel.append(cover);
          feature.append(photoPanel);
        }
        band.classList.add('program-detail-info');
        feature.append(band);
        layout.parentNode.insertBefore(feature, layout);
      }
    }
    const backLink = root.querySelector('.opportunity-back');
    if (backLink) backLink.textContent = isJob ? 'Back to vacancies' : 'Back to programs';
    const upcomingMessage = root.querySelector('.opportunity-detail-band .btn-quiet');
    if (upcomingMessage && item.status === 'upcoming') upcomingMessage.textContent = `Registration opens ${prettyDate(item.opensAt)}`;
    if (!isJob) {
      const postedDate = [...root.querySelectorAll('.opportunity-detail-meta > span')].find(span => span.textContent.startsWith('Posted '));
      postedDate?.remove();
      const aside = root.querySelector('.opportunity-detail-aside');
      const intro = aside?.querySelector('h2 + p');
      if (intro) intro.textContent = 'Register with your name, email and phone. The full application form opens after registration.';
      const documentHeading = [...(aside?.querySelectorAll('h3') || [])].find(heading => heading.textContent === 'Requested documents');
      if (documentHeading) {
        documentHeading.textContent = 'Before you continue';
        if (documentHeading.nextElementSibling) documentHeading.nextElementSibling.innerHTML = `<li>Full name</li><li>Email address</li><li>Phone number</li>${docs}`;
      }
      const asideLink = aside?.querySelector('a.btn-primary');
      asideLink?.remove();
      aside?.querySelector('.aside-deadline')?.remove();
    }
    if (!isJob && !item.eligibility) {
      const eligibilityHeading = [...root.querySelectorAll('.opportunity-article h2')].find(heading => heading.textContent === 'Who should apply');
      eligibilityHeading?.parentElement.remove();
    }
    const preparation = isJob ? ['Education and qualifications', 'Work history and responsibilities', 'Cover letter (optional)'] : [];
    if (preparation.length) root.querySelector('.aside-deadline')?.insertAdjacentHTML('beforebegin', `<h3>Prepare to share</h3><ul>${preparation.map(entry => `<li>${escapeHtml(entry)}</li>`).join('')}</ul>`);
  } catch (error) {
    root.innerHTML = `<div class="article-error"><h1>We could not load this ${type === 'vacancy' ? 'vacancy' : 'program'}</h1><p>Please return to the list and try again.</p><a href="${type === 'vacancy' ? '/careers.html' : '/programs.html'}">Return to ${type === 'vacancy' ? 'vacancies' : 'programs'}</a></div>`;
  }
}
function applicationField(label, name, options = {}) {
  const required = options.required ? ' required' : '';
  const fieldId = `application-field-${String(name).replace(/[^a-z0-9_-]/gi, '-')}`;
  const helpId = `${fieldId}-help`;
  const errorId = `${fieldId}-error`;
  const describedBy = [options.help ? helpId : '', errorId].filter(Boolean).join(' ');
  const help = options.help ? `<small class="question-help" id="${helpId}">${escapeHtml(options.help)}</small>` : '';
  const control = options.textarea
    ? `<textarea id="${fieldId}" name="${escapeHtml(name)}" maxlength="${options.maxlength || 5000}"${required} ${options.autocomplete ? `autocomplete="${options.autocomplete}"` : ''}${describedBy ? ` aria-describedby="${describedBy}"` : ''}></textarea>`
    : `<input id="${fieldId}" name="${escapeHtml(name)}" type="${options.type || 'text'}" maxlength="${options.maxlength || 180}"${options.minlength ? ` minlength="${options.minlength}"` : ''}${required} ${options.autocomplete ? `autocomplete="${options.autocomplete}"` : ''}${options.accept ? ` accept="${options.accept}"` : ''}${describedBy ? ` aria-describedby="${describedBy}"` : ''}>`;
  return `<label class="form-field" for="${fieldId}"><span class="field-label"><span class="field-label-text">${escapeHtml(label)}</span>${options.required ? '<span class="field-required">Required</span>' : '<span class="field-optional">Optional</span>'}</span>${control}${help}<small class="field-error" id="${errorId}" hidden></small></label>`;
}
async function initProgramRegistration(root, item) {
  root.innerHTML = `<div class="application-shell"><a class="opportunity-back" href="/opportunity.html?type=program&amp;id=${encodeURIComponent(item.id)}">&#8592; Back to program details</a><div class="application-heading"><span class="listing-kicker">PROGRAM REGISTRATION</span><h1>Register your interest</h1><p>${escapeHtml(item.title)} <span>·</span> ${escapeHtml(item.location || 'Rwanda')}</p></div><div class="application-save-status" role="status"><span class="save-status-dot" aria-hidden="true"></span><span>Enter your contact details to continue to the program application form.</span></div><form id="program-registration-form" class="application-form"><div class="application-step-heading"><span>01</span><div><h2>Your contact details</h2><p>We will use these details to identify your program registration.</p></div></div><div class="application-fields">${applicationField('Full name', 'name', { required: true, autocomplete: 'name', minlength: 2, maxlength: 140 })}${applicationField('Email address', 'email', { type: 'email', required: true, autocomplete: 'email', maxlength: 180 })}${applicationField('Phone number', 'phone', { type: 'tel', required: true, autocomplete: 'tel', minlength: 6, maxlength: 50 })}</div><label class="program-registration-honeypot" aria-hidden="true" tabindex="-1">Leave this field empty<input name="website" tabindex="-1" autocomplete="off"></label><p id="program-registration-error" class="field-error" role="alert" hidden></p><div class="application-form-actions"><a class="btn btn-quiet" href="/programs.html">Cancel</a><span class="application-action-spacer"></span><button type="submit" class="btn btn-primary" id="program-registration-submit">Continue <span aria-hidden="true">&#8594;</span></button></div><p class="application-privacy-note">Your details are shared with IRONA&#8217;s authorized program team.</p></form></div>`;
  const registrationShell = root.querySelector('.application-shell');
  registrationShell.classList.add('program-registration-shell');
  registrationShell.querySelector('.application-heading h1').textContent = 'Register for this program';
  const saveStatus = registrationShell.querySelector('.application-save-status');
  saveStatus.className = 'program-registration-intro';
  saveStatus.textContent = 'Enter your contact details. You can continue to the program form after registering.';
  registrationShell.querySelector('.application-step-heading h2').textContent = 'Your details';
  registrationShell.querySelector('.application-step-heading p')?.remove();
  registrationShell.querySelector('.application-privacy-note')?.remove();
  const backButton = registrationShell.querySelector('.application-form-actions .btn-quiet');
  backButton.textContent = 'Back';
  backButton.href = `/opportunity.html?type=program&id=${encodeURIComponent(item.id)}`;
  document.title = `Register for ${item.title} | Irona`;
  const form = $('#program-registration-form');
  const submit = $('#program-registration-submit');
  submit.innerHTML = 'Register <span aria-hidden="true">&#8594;</span>';
  const overlay = $('#application-submit-overlay');
  const errorBox = $('#program-registration-error');
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    submit.disabled = true;
    errorBox.hidden = true;
    const startedAt = performance.now();
    overlay.hidden = false;
    $('#application-submit-message').textContent = 'Saving your program registration';
    try {
      const data = Object.fromEntries(new FormData(form));
      const result = await api('/api/program-registrations', { method: 'POST', body: JSON.stringify({ ...data, programId: item.id }) });
      const remaining = Math.max(0, 650 - (performance.now() - startedAt));
      if (remaining) await new Promise(resolve => setTimeout(resolve, remaining));
      overlay.hidden = true;
      root.innerHTML = `<section class="application-success"><span class="application-success-icon" aria-hidden="true">&#10003;</span><span class="listing-kicker">REGISTRATION RECEIVED</span><h1>Thank you, ${escapeHtml(data.name.trim().split(/\s+/)[0])}.</h1><p>Your registration for <b>${escapeHtml(item.title)}</b> has been saved. Continue when you are ready to answer the detailed program application questions.</p><a class="btn btn-primary" href="${escapeHtml(result.applicationFormUrl)}" target="_blank" rel="noopener noreferrer">Continue to application form <span aria-hidden="true">&#8599;</span></a><p class="application-privacy-note">The Google Form opens only when you select the button above.</p></section>`;
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
      const remaining = Math.max(0, 650 - (performance.now() - startedAt));
      if (remaining) await new Promise(resolve => setTimeout(resolve, remaining));
      overlay.hidden = true;
      errorBox.textContent = error.message || 'We could not save your registration. Please try again.';
      errorBox.hidden = false;
      const duplicate = error.status === 409 && /already registered/i.test(error.message);
      submit.disabled = duplicate;
      submit.innerHTML = duplicate ? 'Already registered' : 'Try again <span aria-hidden="true">&#8594;</span>';
    }
  });
}
async function initApplicationPage() {
  const root = $('#application-root');
  if (!root) return;
  const params = new URLSearchParams(location.search); const type = opportunityPageType(); const id = params.get('id');
  if (!id) { root.innerHTML = '<div class="article-error"><h1>Application unavailable</h1><p>Return to the opportunity listings and choose an open opportunity.</p><a href="/careers.html">Browse vacancies</a></div>'; return; }
  let item;
  try {
    item = (await api(opportunityEndpoint(type, id))).opportunity;
    try { localStorage.setItem(`irona-opportunity:${id}`, JSON.stringify(item)); } catch { /* The online application remains available when browser storage is full. */ }
  }
  catch (error) {
    try { item = JSON.parse(localStorage.getItem(`irona-opportunity:${id}`) || 'null'); } catch { item = null; }
    if (!item) { root.innerHTML = `<div class="article-error"><h1>Application unavailable</h1><p>${escapeHtml(error.message)}</p><a href="${type === 'vacancy' ? '/careers.html' : '/programs.html'}">Return to opportunities</a></div>`; return; }
  }
  item.isOpen = item.isOpen && (!item.closesAt || new Date(item.closesAt).getTime() >= Date.now());
  if (!item.isOpen) { root.innerHTML = `<div class="article-error"><h1>Applications are closed</h1><p>${escapeHtml(item.title)} is no longer accepting applications.</p><a href="${type === 'vacancy' ? '/careers.html' : '/programs.html'}">Return to opportunities</a></div>`; return; }
  if (type === 'program') { await initProgramRegistration(root, item); return; }
  const isJob = item.type === 'job';
  const questionFields = (item.questions || []).map(question => applicationField(question.label, question.id, { textarea: true, required: question.required, maxlength: 5000 })).join('');
  const educationFields = `<div class="application-history" id="education-history"><div class="history-section-heading"><div><h3>Education &amp; qualifications</h3><p>Add your completed or current studies. You can include more than one.</p></div><button type="button" class="history-add" data-add-record="education">+ Add education</button></div><div class="history-records" data-record-list="education"></div></div>`;
  const experienceFields = `<div class="application-history" id="work-history"><div class="history-section-heading"><div><h3>Work experience</h3><p>Include paid work, internships, consulting, or relevant volunteer roles.</p></div><button type="button" class="history-add" data-add-record="work">+ Add experience</button></div><div class="history-records" data-record-list="work"></div></div>`;
  const documentFields = isJob
    ? applicationField('CV / résumé', 'cv', { type: 'file', accept: '.pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document', required: true, help: 'Required · PDF or Word document · Application documents up to 3 MB total' })
    : (item.applicationDocuments || []).map((doc, index) => applicationField(doc.label, `document_${index}`, { type: 'file', accept: '.pdf,.doc,.docx,.jpg,.jpeg,.png,.webp,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/jpeg,image/png,image/webp', required: doc.required, help: `${doc.required ? 'Required' : 'Optional'} · PDF, Word or image · Application documents up to 3 MB total` })).join('');
  root.innerHTML = `<div class="application-shell"><a class="opportunity-back" href="/opportunity.html?type=${encodeURIComponent(type)}&id=${encodeURIComponent(item.id)}">← Back to opportunity details</a><div class="application-heading"><span class="listing-kicker">${isJob ? 'CAREER APPLICATION' : 'PROGRAM APPLICATION'}</span><h1>${isJob ? 'Apply for this role' : 'Apply to this program'}</h1><p>${escapeHtml(item.title)} <span>·</span> ${escapeHtml(item.location || 'Rwanda')}</p></div><div class="application-save-status" id="application-save-status" data-state="saved" role="status" aria-live="polite"><span class="save-status-icon" aria-hidden="true">✓</span><span data-save-message>Your draft is ready</span><button type="button" id="application-retry-sync" hidden>Retry saving</button></div><nav class="application-progress" aria-label="Application progress"><p class="application-progress-count" aria-live="polite">Step <b data-current-step>1</b> of 4</p><div class="application-progress-steps">${['Your details', isJob ? 'Profile' : 'Questions', 'Documents', 'Review'].map((label, index) => `<button type="button" data-step-nav="${index}" aria-controls="application-step-${index}" aria-current="${index === 0 ? 'step' : 'false'}"><span class="application-step-number">${String(index + 1).padStart(2, '0')}</span><span class="application-step-label">${label}</span></button>`).join('')}</div></nav><form id="application-form" class="application-form" novalidate><input type="hidden" name="contentId" value="${escapeHtml(item.id)}"><section id="application-step-0" class="application-step" data-step-panel="0" aria-labelledby="application-step-heading-0"><div class="application-step-heading"><span>01</span><div><h2 id="application-step-heading-0">Your contact details</h2><p>Provide your contact details for this application.</p></div></div><div class="application-fields">${applicationField('Full name', 'name', { required: true, autocomplete: 'name', maxlength: 140 })}${applicationField('Email address', 'email', { type: 'email', required: true, autocomplete: 'email', maxlength: 180 })}${applicationField('Telephone number', 'phone', { type: 'tel', required: true, autocomplete: 'tel', maxlength: 50 })}${applicationField('Current location', 'location', { autocomplete: 'address-level2', maxlength: 180 })}</div></section><section id="application-step-1" class="application-step" data-step-panel="1" aria-labelledby="application-step-heading-1" hidden><div class="application-step-heading"><span>02</span><div><h2 id="application-step-heading-1">${isJob ? 'Education & experience' : 'Your responses'}</h2><p>${isJob ? 'Add your education and work history. These sections are optional.' : 'Answer the questions set for this program.'}</p></div></div><div class="application-fields">${isJob ? `${educationFields}${experienceFields}${applicationField('Cover letter / motivation', 'coverLetter', { textarea: true, maxlength: 5000, help: 'Optional. Tell us why this role interests you.' })}` : (questionFields || '<p class="application-note">This program does not require written responses beyond your contact details.</p>')}</div></section><section id="application-step-2" class="application-step" data-step-panel="2" aria-labelledby="application-step-heading-2" hidden><div class="application-step-heading"><span>03</span><div><h2 id="application-step-heading-2">Supporting documents</h2><p>Add the documents requested for this role.</p></div></div><div class="application-fields">${documentFields || '<p class="application-note">No supporting documents are required for this program.</p>'}</div></section><section id="application-step-3" class="application-step" data-step-panel="3" aria-labelledby="application-step-heading-3" hidden><div class="application-step-heading"><span>04</span><div><h2 id="application-step-heading-3">Review your application</h2><p>Check your details and selected files before sending them to IRONA.</p></div></div><div class="application-review" id="application-review"></div></section><div class="application-form-actions"><button type="button" class="btn btn-quiet" id="application-previous" hidden>Previous</button><span class="application-action-spacer"></span><button type="button" class="btn btn-primary" id="application-next">Continue <span aria-hidden="true">→</span></button><button type="submit" class="btn btn-primary" id="application-submit" hidden>Submit application <span aria-hidden="true">→</span></button></div></form></div>`;
  if (!documentFields) $('.file-retention-note', root)?.remove();
  document.title = `${isJob ? 'Apply' : 'Program application'}: ${item.title} | Irona`;
  const form = $('#application-form'); const panels = $$('[data-step-panel]', form); const navButtons = $$('[data-step-nav]');
  const attr = value => escapeHtml(value || '');
  const recordTemplates = {
    education(index, value = {}) { return `<article class="history-record" data-record="education"><header><h4>Education ${index + 1}</h4><button type="button" class="history-remove" data-remove-record>Remove</button></header><div class="history-grid"><label class="history-field"><span>Qualification level</span><select data-record-field="level"><option value="">Choose level</option>${['Secondary school','Certificate','Diploma',"Bachelor's degree",'Honours degree',"Master's degree",'Doctorate / PhD','Professional qualification','Other'].map(option => `<option ${value.level === option ? 'selected' : ''}>${option}</option>`).join('')}</select></label><label class="history-field"><span>Qualification / subject studied</span><input data-record-field="qualification" maxlength="180" placeholder="e.g. BSc Economics" value="${attr(value.qualification)}"></label><label class="history-field"><span>Institution</span><input data-record-field="institution" maxlength="180" placeholder="University, college or school" value="${attr(value.institution)}"></label><label class="history-field"><span>Faculty, school or department <em>Optional</em></span><input data-record-field="faculty" maxlength="180" placeholder="e.g. College of Business" value="${attr(value.faculty)}"></label><label class="history-field"><span>Start date</span><input type="month" data-record-field="startDate" value="${attr(value.startDate)}"></label><label class="history-field"><span>End date</span><input type="month" data-record-field="endDate" value="${attr(value.endDate)}" ${value.current ? 'disabled' : ''}></label><label class="history-current"><input type="checkbox" data-record-field="current" ${value.current ? 'checked' : ''}><span>I am currently studying here</span></label></div></article>`; },
    work(index, value = {}) { return `<article class="history-record" data-record="work"><header><h4>Experience ${index + 1}</h4><button type="button" class="history-remove" data-remove-record>Remove</button></header><div class="history-grid"><label class="history-field"><span>Employer</span><input data-record-field="employer" maxlength="180" placeholder="Organisation or employer" value="${attr(value.employer)}"></label><label class="history-field"><span>Role / job title</span><input data-record-field="role" maxlength="180" placeholder="Your position" value="${attr(value.role)}"></label><label class="history-field"><span>Start date</span><input type="month" data-record-field="startDate" value="${attr(value.startDate)}"></label><label class="history-field"><span>End date</span><input type="month" data-record-field="endDate" value="${attr(value.endDate)}" ${value.current ? 'disabled' : ''}></label><label class="history-current"><input type="checkbox" data-record-field="current" ${value.current ? 'checked' : ''}><span>I currently work here</span></label><label class="history-field history-field-wide"><span>Main responsibilities</span><textarea data-record-field="responsibilities" maxlength="2400" rows="4" placeholder="Describe your responsibilities and contributions">${escapeHtml(value.responsibilities || '')}</textarea></label></div></article>`; }
  };
  const addHistoryRecord = (kind, value = {}) => { const list = $(`[data-record-list="${kind}"]`, form); if (!list || list.children.length >= 20) return; list.insertAdjacentHTML('beforeend', recordTemplates[kind](list.children.length, value)); };
  if (isJob) { addHistoryRecord('education'); addHistoryRecord('work'); }
  $$('[data-add-record]', form).forEach(button => button.addEventListener('click', () => addHistoryRecord(button.dataset.addRecord)));
  form.addEventListener('click', event => { const remove = event.target.closest('[data-remove-record]'); if (!remove) return; const record = remove.closest('.history-record'); const list = record.parentElement; record.remove(); [...list.children].forEach((card, index) => { card.querySelector('h4').textContent = `${card.dataset.record === 'education' ? 'Education' : 'Experience'} ${index + 1}`; }); saveDraft(); });
  form.addEventListener('change', event => { const current = event.target.closest('[data-record-field="current"]'); if (current) { const end = current.closest('.history-record').querySelector('[data-record-field="endDate"]'); end.disabled = current.checked; if (current.checked) end.value = ''; } });
  form.elements.namedItem('name').minLength = 2;
  form.elements.namedItem('phone').minLength = 6;
  const localKey = `irona-application-draft:${item.id}`;
  const filesKey = `${localKey}:files`;
  const cached = (() => {
    try {
      const saved = JSON.parse(localStorage.getItem(localKey) || 'null');
      if (saved?.updatedAt && Date.now() - new Date(saved.updatedAt).getTime() > 30 * 86400000) { localStorage.removeItem(localKey); return null; }
      return saved;
    } catch { return null; }
  })();
  $('#application-save-status').insertAdjacentHTML('afterend', '<div class="application-top-actions"><button type="button" id="application-exit">Save &amp; exit</button></div>');
  let draftId = cached?.draftId || '';
  let fileStorageAvailable = 'indexedDB' in window;
  let step = 0; let saveTimer; let saving = false; let saveAgain = false;
  const status = (message, state = 'saved') => {
    const box = $('#application-save-status');
    const icon = { saved: '✓', saving: '↻', offline: '⌁', error: '!' }[state] || '✓';
    box.dataset.state = state; $('.save-status-icon', box).textContent = icon; $('[data-save-message]', box).textContent = message;
    $('#application-retry-sync').hidden = state !== 'error';
  };
  const openFileStore = () => new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) return reject(new Error('Local file storage is unavailable.'));
    const request = indexedDB.open('irona-application-drafts', 1);
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains('files')) request.result.createObjectStore('files', { keyPath: 'key' }); };
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error || new Error('Could not open local file storage.'));
  });
  const saveFilesLocally = async () => {
    const files = $$('input[type=file]', form).map(input => ({ name: input.name, files: [...input.files].map(file => ({ name: file.name, type: file.type, lastModified: file.lastModified, blob: file })) }));
    try {
      const db = await openFileStore();
      await new Promise((resolve, reject) => { const tx = db.transaction('files', 'readwrite'); tx.objectStore('files').put({ key: filesKey, files, updatedAt: Date.now() }); tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error); });
      db.close();
    } catch { fileStorageAvailable = false; status('Draft could not be saved. Please try again.', 'error'); }
  };
  const restoreFilesLocally = async () => {
    try {
      const db = await openFileStore();
      const saved = await new Promise((resolve, reject) => { const request = db.transaction('files').objectStore('files').get(filesKey); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
      if (saved?.updatedAt && Date.now() - saved.updatedAt > 30 * 86400000) {
        await new Promise((resolve, reject) => { const tx = db.transaction('files', 'readwrite'); tx.objectStore('files').delete(filesKey); tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); });
        db.close(); return;
      }
      db.close();
      for (const item of saved?.files || []) {
        const input = form.elements.namedItem(item.name); if (!input || !item.files?.length) continue;
        const transfer = new DataTransfer();
        for (const file of item.files) transfer.items.add(new File([file.blob], file.name, { type: file.type, lastModified: file.lastModified }));
        input.files = transfer.files;
      }
    } catch { fileStorageAvailable = false; /* Text drafts remain available; browser security may prevent restoring file selections. */ }
  };
  const clearSavedFiles = async () => {
    try { const db = await openFileStore(); await new Promise((resolve, reject) => { const tx = db.transaction('files', 'readwrite'); tx.objectStore('files').delete(filesKey); tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); }); db.close(); } catch { /* Expire with the browser's local draft retention. */ }
  };
  const getValues = () => {
    const data = Object.fromEntries([...new FormData(form)].filter(([key, value]) => key !== 'contentId' && key !== 'consent' && typeof value === 'string'));
    const answers = Object.fromEntries((item.questions || []).map(question => [question.id, data[question.id] || '']));
    const readRecords = kind => $$(`[data-record="${kind}"]`, form).map(card => Object.fromEntries([...card.querySelectorAll('[data-record-field]')].map(field => [field.dataset.recordField, field.type === 'checkbox' ? field.checked : field.value.trim()])));
    return { name: data.name || '', email: data.email || '', phone: data.phone || '', location: data.location || '', educationHistory: readRecords('education'), workHistory: readRecords('work'), coverLetter: data.coverLetter || '', answers };
  };
  const storeLocal = values => { try { localStorage.setItem(localKey, JSON.stringify({ draftId, values, updatedAt: new Date().toISOString() })); } catch { status('Draft could not be saved. Please try again.', 'error'); } };
  const setValues = values => {
    if (!values) return;
    if (isJob) {
      $$('[data-record-list="education"]', form).forEach(list => { list.innerHTML = ''; });
      $$('[data-record-list="work"]', form).forEach(list => { list.innerHTML = ''; });
      (values.educationHistory?.length ? values.educationHistory : [values.education ? { qualification: values.education } : {}]).forEach(record => addHistoryRecord('education', record));
      (values.workHistory?.length ? values.workHistory : [values.experience ? { responsibilities: values.experience } : {}]).forEach(record => addHistoryRecord('work', record));
    }
    for (const [key, value] of Object.entries({ ...values, ...(values.answers || {}) })) {
      const field = form.elements.namedItem(key);
      if (field && typeof field.value === 'string' && field.type !== 'file' && field.type !== 'checkbox') field.value = value || '';
    }
  };
  const syncServer = async values => {
    if (!navigator.onLine) { status('You are offline. Reconnect to continue.', 'offline'); return; }
    if (saving) { saveAgain = true; return; }
    saving = true;
    try {
      if (!draftId) {
        const created = await api('/api/content-application-drafts', { method: 'POST', body: JSON.stringify({ contentId: item.id }) });
        draftId = created.draftId;
        storeLocal(values);
      }
      await api(`/api/content-application-drafts/${encodeURIComponent(draftId)}`, { method: 'PUT', body: JSON.stringify(values) });
      storeLocal(values); status('Draft saved.', 'saved');
    } catch (error) {
      status(navigator.onLine ? 'Draft could not be saved. Please try again.' : 'You are offline. Reconnect to continue.', navigator.onLine ? 'error' : 'offline');
    } finally {
      saving = false;
      if (saveAgain) { saveAgain = false; syncServer(getValues()); }
    }
  };
  const saveDraft = () => {
    const values = getValues(); storeLocal(values);
    status(navigator.onLine ? 'Saving draft?' : 'You are offline. Reconnect to continue.', navigator.onLine ? 'saving' : 'offline');
    clearTimeout(saveTimer); saveTimer = setTimeout(() => syncServer(values), 700);
  };
  const draftFromServer = async () => {
    if (!draftId || !navigator.onLine) return;
    try {
      const result = await api(`/api/content-application-drafts/${encodeURIComponent(draftId)}`);
      if (result.draft.contentId !== item.id) return;
      const serverTime = new Date(result.draft.updatedAt).getTime(); const localTime = new Date(cached?.updatedAt || 0).getTime();
      if (serverTime > localTime) { setValues(result.draft.values); storeLocal(result.draft.values); }
    } catch { /* Local autosave remains available if server sync is temporarily unavailable. */ }
  };
  setValues(cached?.values); await restoreFilesLocally(); status(cached ? (navigator.onLine ? 'Draft restored.' : 'Draft restored. Reconnect to continue.') : (navigator.onLine ? 'Your draft is ready.' : 'You are offline. Reconnect to continue.'));
  await draftFromServer();
  if (cached?.values) setValues(JSON.parse(localStorage.getItem(localKey) || 'null')?.values || cached.values);
  const showStep = index => {
    step = Math.max(0, Math.min(panels.length - 1, index));
    panels.forEach((panel, panelIndex) => { panel.hidden = panelIndex !== step; });
    navButtons.forEach((button, buttonIndex) => { button.setAttribute('aria-current', buttonIndex === step ? 'step' : 'false'); button.classList.toggle('complete', buttonIndex < step); $('.application-step-number', button).textContent = buttonIndex < step ? '✓' : String(buttonIndex + 1).padStart(2, '0'); });
    $('[data-current-step]').textContent = String(step + 1);
    $('#application-previous').hidden = step === 0;
    $('#application-next').hidden = step === panels.length - 1;
    $('#application-submit').hidden = step !== panels.length - 1;
    if (step === panels.length - 1) paintReview();
    window.scrollTo({ top: $('.application-shell').getBoundingClientRect().top + window.scrollY - 92, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  };
  const fieldMessage = field => {
    if (field.validity.valueMissing) return 'This field is required.';
    if (field.validity.typeMismatch && field.type === 'email') return 'Enter an email address in the format name@example.com.';
    if (field.validity.tooShort) return `Enter at least ${field.minLength} characters.`;
    if (field.validity.tooLong) return `Use ${field.maxLength} characters or fewer.`;
    return 'Check this answer and try again.';
  };
  const validatePanel = panel => {
    let firstInvalid = null;
    $$('input,textarea,select', panel).forEach(field => {
      const error = field.closest('.form-field')?.querySelector('.field-error');
      if (!field.checkValidity()) {
        field.setAttribute('aria-invalid', 'true'); if (error) { error.textContent = fieldMessage(field); error.hidden = false; }
        firstInvalid ||= field;
      } else { field.removeAttribute('aria-invalid'); if (error) { error.textContent = ''; error.hidden = true; } }
    });
    if (firstInvalid) { firstInvalid.focus(); return false; }
    return true;
  };
  const validateStep = () => validatePanel(panels[step]);
  function paintReview() {
    const values = getValues();
    const rows = [['Full name', values.name], ['Email address', values.email], ['Telephone', values.phone], ['Location', values.location], ...(isJob ? [['Cover letter / motivation', values.coverLetter]] : []), ...(item.questions || []).map(question => [question.label, values.answers[question.id]])].filter(([, value]) => String(value || '').trim());
    const files = $$('input[type=file]', form).map(field => ({ label: field.closest('.form-field')?.querySelector('.field-label-text')?.textContent.trim() || field.name, name: field.files[0]?.name || '' }));
    const educationMarkup = values.educationHistory.filter(record => Object.values(record).some(Boolean)).map((record, index) => `<div class="review-history-item"><b>Education ${index + 1}: ${escapeHtml([record.level, record.qualification].filter(Boolean).join(' · ') || 'Study')}</b><span>${escapeHtml([record.institution, record.faculty, record.startDate, record.current ? 'Currently studying' : record.endDate].filter(Boolean).join(' · '))}</span></div>`).join('');
    const workMarkup = values.workHistory.filter(record => Object.values(record).some(Boolean)).map((record, index) => `<div class="review-history-item"><b>Experience ${index + 1}: ${escapeHtml([record.role, record.employer].filter(Boolean).join(' · ') || 'Work experience')}</b><span>${escapeHtml([record.startDate, record.current ? 'Currently working' : record.endDate].filter(Boolean).join(' · '))}</span>${record.responsibilities ? `<p>${escapeHtml(record.responsibilities)}</p>` : ''}</div>`).join('');
    $('#application-review').innerHTML = `<div class="review-group"><h3>Applicant details</h3>${rows.slice(0, 4).map(([label, value]) => `<div><span>${escapeHtml(label)}</span><b>${escapeHtml(value)}</b></div>`).join('')}</div>${isJob ? `<div class="review-group"><h3>Education &amp; qualifications</h3>${educationMarkup || '<p>No education details added.</p>'}</div><div class="review-group"><h3>Work experience</h3>${workMarkup || '<p>No experience details added.</p>'}</div>` : ''}${rows.length > 4 ? `<div class="review-group"><h3>${isJob ? 'Role responses' : 'Program responses'}</h3>${rows.slice(4).map(([label, value]) => `<div><span>${escapeHtml(label)}</span><b>${escapeHtml(value)}</b></div>`).join('')}</div>` : ''}<div class="review-group"><h3>Documents</h3>${files.length ? files.map(file => `<div><span>${escapeHtml(file.label)}</span><b>${escapeHtml(file.name || 'Not selected')}</b></div>`).join('') : '<p>No documents requested.</p>'}</div>`;
  }
  form.addEventListener('input', event => { const field = event.target; if (field.matches('input,textarea,select')) { field.removeAttribute('aria-invalid'); const error = field.closest('.form-field')?.querySelector('.field-error'); if (error) { error.textContent = ''; error.hidden = true; } } saveDraft(); });
  form.addEventListener('change', event => { if (event.target.type === 'file') { const selectedBytes = $$('input[type=file]', form).reduce((total, field) => total + (field.files[0]?.size || 0), 0); if (selectedBytes > 3 * 1024 * 1024) { event.target.value = ''; showToast('All application documents combined must be 3 MB or smaller.'); } else { saveFilesLocally(); } } saveDraft(); });
  $('#application-retry-sync').onclick = () => { status('Saving draft…', 'saving'); syncServer(getValues()); };
  $('#application-next').onclick = () => { if (validateStep()) showStep(step + 1); };
  $('#application-previous').onclick = () => showStep(step - 1);
  $('#application-exit').onclick = async () => {
    const values = getValues(); storeLocal(values); clearTimeout(saveTimer);
    const waitUntil = Date.now() + 5000;
    while (saving && Date.now() < waitUntil) await new Promise(resolve => setTimeout(resolve, 50));
    if (!saving) await syncServer(values);
    location.assign(`/opportunity.html?type=${encodeURIComponent(type)}&id=${encodeURIComponent(item.id)}`);
  };
  navButtons.forEach((button, index) => button.onclick = () => { if (index <= step || (index === step + 1 && validateStep())) showStep(index); });
  window.addEventListener('online', () => syncServer(getValues()));
  window.addEventListener('pagehide', () => { try { storeLocal(getValues()); } catch {} });
  form.onsubmit = async event => {
    event.preventDefault();
    for (let index = 0; index < panels.length; index++) {
      if (!validatePanel(panels[index])) { showStep(index); const invalid = $$('input,textarea,select', panels[index]).find(field => !field.checkValidity()); invalid?.focus(); return; }
    }
    const submit = $('#application-submit'); submit.disabled = true; submit.textContent = 'Submitting…';
    const submitOverlay = $('#application-submit-overlay');
    const loadingStarted = performance.now();
    submitOverlay.hidden = false;
    const values = getValues();
    const data = new FormData(form); data.set('answers', JSON.stringify(values.answers));
    data.set('educationHistory', JSON.stringify(values.educationHistory));
    data.set('workHistory', JSON.stringify(values.workHistory));
    if (draftId) data.set('draftToken', draftId);
    try {
      const result = await api('/api/content-applications', { method: 'POST', body: data });
      localStorage.removeItem(localKey);
      await clearSavedFiles();
      const loadingRemaining = Math.max(0, 650 - (performance.now() - loadingStarted));
      if (loadingRemaining) await new Promise(resolve => setTimeout(resolve, loadingRemaining));
      submitOverlay.hidden = true;
      root.innerHTML = `<div class="application-success"><span class="application-success-icon" aria-hidden="true">✓</span><span class="listing-kicker">APPLICATION RECEIVED</span><h1>Thank you, ${escapeHtml(getValues().name.split(/\s+/)[0])}.</h1><p>Your application for <b>${escapeHtml(item.title)}</b> has been submitted to IRONA. We have recorded your details and documents.</p><div class="application-reference"><span>REFERENCE</span><b>${escapeHtml(result.reference || 'Received')}</b></div><a class="btn btn-primary" href="${isJob ? '/careers.html' : '/programs.html'}">Return to ${isJob ? 'careers' : 'programs'}</a></div>`;
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) { const loadingRemaining = Math.max(0, 650 - (performance.now() - loadingStarted)); if (loadingRemaining) await new Promise(resolve => setTimeout(resolve, loadingRemaining)); submitOverlay.hidden = true; showToast(error instanceof TypeError ? 'You appear to be offline. Your draft and selected files are saved on this device; reconnect to submit.' : error.message); const duplicate = error.status === 409 && /already received an application/i.test(error.message); submit.disabled = duplicate; submit.innerHTML = duplicate ? 'Already submitted' : 'Submit application <span aria-hidden="true">&#8594;</span>'; }
  };
}

function initMotion() {
  const observer = new IntersectionObserver(entries => entries.forEach(entry => {
    if (entry.isIntersecting) { entry.target.classList.add('in-view'); observer.unobserve(entry.target); }
  }), { threshold: .13, rootMargin: '0px 0px -35px 0px' });
  $$('.reveal').forEach(el => observer.observe(el));
  const words = ['SMEs & cooperatives', 'public institutions', 'development partners', 'civil society organisations'];
  const target = $('#typed-word');
  if (!target || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  let wordIndex = 0, charIndex = words[0].length, deleting = true;
  const tick = () => {
    const word = words[wordIndex];
    if (deleting) { charIndex--; target.textContent = word.slice(0, Math.max(charIndex, 0)); }
    else { charIndex++; target.textContent = words[wordIndex].slice(0, charIndex); }
    let delay = deleting ? 45 : 75;
    if (!deleting && charIndex >= words[wordIndex].length) { deleting = true; delay = 1850; }
    else if (deleting && charIndex <= 0) { deleting = false; wordIndex = (wordIndex + 1) % words.length; delay = 260; }
    setTimeout(tick, delay);
  };
  setTimeout(tick, 2200);
}

function initCounters() {
  const counters = $$('.count-value[data-count]');
  if (!counters.length) return;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const animate = element => {
    const target = Number(element.dataset.count);
    if (reducedMotion || !Number.isFinite(target)) { element.textContent = String(target); return; }
    const startedAt = performance.now();
    const duration = 1250;
    const frame = now => {
      const progress = Math.min((now - startedAt) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      element.textContent = String(Math.round(target * eased));
      if (progress < 1) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  };
  if (reducedMotion || !('IntersectionObserver' in window)) {
    counters.forEach(animate);
    return;
  }
  const observer = new IntersectionObserver(entries => entries.forEach(entry => {
    if (entry.isIntersecting) { animate(entry.target); observer.unobserve(entry.target); }
  }), { threshold: .45 });
  counters.forEach(counter => observer.observe(counter));
}

function initTeamProfiles() {
  const dialog = $('#team-profile-modal');
  if (!dialog) return;
  const cards = $$('.team-card[data-name]');
  let activeIndex = 0;
  const paint = index => {
    activeIndex = (index + cards.length) % cards.length;
    const card = cards[activeIndex];
    const photo = $('[data-profile-photo]', dialog);
    const fallbackPhoto = $('.team-modal-photo svg', dialog);
    const fallbackLabel = $('.team-modal-photo span', dialog);
    const photoUrl = card.dataset.photo || '';
    $('[data-profile-name]', dialog).textContent = card.dataset.name || '';
    $('[data-profile-role]', dialog).textContent = card.dataset.role || '';
    const bio = $('[data-profile-bio]', dialog);
    bio.textContent = card.dataset.bio || '';
    bio.hidden = !card.dataset.bio;
    if (photoUrl) {
      photo.src = photoUrl;
      photo.alt = `${card.dataset.name || 'Team member'}, ${card.dataset.role || ''}`.trim();
      photo.hidden = false;
      fallbackPhoto.hidden = true;
      fallbackLabel.hidden = true;
    } else {
      photo.removeAttribute('src');
      photo.alt = '';
      photo.hidden = true;
      fallbackPhoto.hidden = false;
      fallbackLabel.hidden = false;
    }

    const social = $('[data-profile-social]', dialog);
    const socialNote = $('[data-profile-social-note]', dialog);
    const socialPanel = $('.team-modal-social', dialog);
    social.replaceChildren();
    const linkedIn = card.dataset.linkedin || '';
    const xProfile = card.dataset.x || '';
    const addSocialIcon = (network, href, svg) => {
      const icon = document.createElement(href ? 'a' : 'span');
      icon.className = 'team-social-icon';
      icon.setAttribute('aria-label', href ? `Open ${card.dataset.name}'s ${network} profile` : `${network} profile not provided`);
      if (href) { icon.href = href; icon.target = '_blank'; icon.rel = 'noopener noreferrer'; }
      icon.innerHTML = svg;
      social.append(icon);
    };
    if (linkedIn || card.dataset.linkedinIcon === 'true') addSocialIcon('LinkedIn', linkedIn, '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5.2 8.7h3v9.6h-3zm1.5-4a1.75 1.75 0 1 0 0 3.5 1.75 1.75 0 0 0 0-3.5Zm4.1 4h2.9V10c.4-.8 1.4-1.6 2.9-1.6 3.1 0 3.7 2 3.7 4.6v5.3h-3v-4.7c0-1.1 0-2.6-1.6-2.6s-1.9 1.2-1.9 2.5v4.8h-3z"/></svg>');
    if (xProfile) addSocialIcon('X', xProfile, '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18.9 2H22l-6.8 7.8L23.2 22H17l-4.8-7.2L5.9 22H2.8l7.3-8.4L2.4 2h6.4l4.3 6.6L18.9 2zm-1.1 18h1.7L7.8 3.9H6z"/></svg>');
    socialPanel.hidden = !social.childElementCount;
    socialNote.textContent = linkedIn || xProfile ? 'Social links open in a new tab.' : '';
    socialNote.hidden = !(linkedIn || xProfile);
    dialog.dataset.activeIndex = String(activeIndex);
  };
  $$('[data-team-profile]').forEach(button => button.addEventListener('click', () => {
    const index = cards.indexOf(button.closest('.team-card'));
    if (index < 0) return;
    paint(index);
    dialog.showModal();
  }));
  $('[data-profile-prev]', dialog)?.addEventListener('click', () => paint(activeIndex - 1));
  $('[data-profile-next]', dialog)?.addEventListener('click', () => paint(activeIndex + 1));
  dialog.addEventListener('click', event => {
    if (event.target === dialog) dialog.close();
  });
}

$('.menu-toggle').addEventListener('click', event => {
  const button = event.currentTarget; const open = button.getAttribute('aria-expanded') === 'true'; button.setAttribute('aria-expanded', String(!open)); $('.main-nav').classList.toggle('open', !open);
});
$$('.main-nav a').forEach(link => link.addEventListener('click', () => { $('.main-nav').classList.remove('open'); $('.menu-toggle').setAttribute('aria-expanded', 'false'); }));
$$('[data-open-auth]').forEach(button => button.addEventListener('click', event => { event.preventDefault(); if (currentUser) openDashboard(currentUser.role === 'admin' ? 'admin' : 'applicant'); else openAuth(); }));
$$('.op-tab').forEach(button => button.addEventListener('click', () => { $$('.op-tab').forEach(x => x.classList.remove('active')); button.classList.add('active'); activeFilter = button.dataset.filter; renderOpportunities(); }));
$('#year').textContent = new Date().getFullYear();
initMotion(); initCounters(); initTeamProfiles(); loadOpportunities(); initOpportunityDetail(); initApplicationPage();
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}), { once: true });
}
loadEditorialCards();
api('/api/me').then(data => { currentUser = data.user; updateNav(); }).catch(() => {});

const chatPanel = $('#chat-panel');
const chatLauncher = $('#chat-launcher');
const chatMessages = $('#chat-messages');
function setChatOpen(open) {
  chatPanel.classList.toggle('open', open);
  chatPanel.setAttribute('aria-hidden', String(!open));
  chatLauncher.setAttribute('aria-expanded', String(open));
  if (open) $('#chat-input').focus();
}
function appendChatSources(message, sources = []) {
  if (!Array.isArray(sources) || !sources.length) return;
  const container = document.createElement('div'); container.className = 'chat-source-list';
  sources.forEach(source => {
    if (!source?.href || !source?.label) return;
    const anchor = document.createElement('a'); anchor.className = 'chat-link';
    anchor.href = source.href; anchor.textContent = source.label;
    if (/^https?:\/\//i.test(source.href)) { anchor.target = '_blank'; anchor.rel = 'noopener noreferrer'; }
    container.append(anchor);
  });
  if (container.childElementCount) message.append(container);
}
function addChatMessage(text, kind, sources = []) {
  const message = document.createElement('div');
  message.className = `chat-message ${kind}-message`;
  message.textContent = text;
  appendChatSources(message, sources);
  chatMessages.append(message); chatMessages.scrollTop = chatMessages.scrollHeight;
}
function cleanAssistantResponse(text) {
  return String(text || '').replace(/\*/g, '').replace(/^\s*#+\s?/gm, '').replace(/^\s*[-\u2022]\s+/gm, '');
}
let chatHistory = [];
let chatBusy = false;
async function sendChat(text, suggested = false) {
  const question = text.trim(); if (!question) return;
  if (chatBusy) return;
  chatBusy = true;
  addChatMessage(question, 'user');
  chatHistory.push({ role: 'user', content: question });
  const input = $('#chat-input'); const submit = $('.chat-form button[type="submit"]');
  const originalPlaceholder = input.placeholder;
  input.placeholder = 'Type your next message while Baza responds...';
  if (submit) submit.disabled = true;
  $$('[data-chat-prompt]').forEach(button => { button.disabled = true; });
  const thinking = document.createElement('div');
  thinking.className = 'chat-message assistant-message chat-thinking';
  thinking.setAttribute('role', 'status');
  thinking.innerHTML = '<span>Thinking</span><i aria-hidden="true"></i><i aria-hidden="true"></i><i aria-hidden="true"></i>';
  chatMessages.append(thinking); chatMessages.scrollTop = chatMessages.scrollHeight;
  let responseMessage = null;
  let fullAnswer = '';
  let typedAnswer = '';
  let typingFrame = 0;
  let lastTypingAt = 0;
  let resolveTypingDrain = null;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const scrollChatToLatest = () => { chatMessages.scrollTop = chatMessages.scrollHeight; };
  const ensureResponseMessage = () => {
    if (responseMessage) return;
    thinking.remove();
    responseMessage = document.createElement('div');
    responseMessage.className = 'chat-message assistant-message typing-message';
    chatMessages.append(responseMessage);
  };
  const animateResponseText = (timestamp = performance.now()) => {
    typingFrame = 0;
    const target = cleanAssistantResponse(fullAnswer);
    if (typedAnswer.length > target.length) typedAnswer = target;
    if (typedAnswer.length < target.length) {
      ensureResponseMessage();
      let count = target.length - typedAnswer.length;
      if (!reducedMotion) {
        if (!lastTypingAt) lastTypingAt = timestamp;
        if (timestamp - lastTypingAt < 32) {
          typingFrame = requestAnimationFrame(animateResponseText);
          return;
        }
        lastTypingAt = timestamp;
        count = 1;
      }
      typedAnswer += target.slice(typedAnswer.length, typedAnswer.length + count);
      responseMessage.textContent = typedAnswer;
      scrollChatToLatest();
    }
    if (typedAnswer.length < cleanAssistantResponse(fullAnswer).length) {
      typingFrame = requestAnimationFrame(animateResponseText);
    } else if (resolveTypingDrain) {
      const resolve = resolveTypingDrain;
      resolveTypingDrain = null;
      resolve();
    }
  };
  const startTyping = () => {
    if (!typingFrame) typingFrame = requestAnimationFrame(animateResponseText);
  };
  const drainTyping = () => {
    if (!typingFrame && typedAnswer.length >= cleanAssistantResponse(fullAnswer).length) return Promise.resolve();
    return new Promise(resolve => { resolveTypingDrain = resolve; });
  };
  try {
    const response = await fetch('/api/assistant/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
      question,
      history: chatHistory.slice(-6, -1),
      preferredLanguage: suggested ? (navigator.language || '') : '',
    }) });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || 'Baza IRONA could not respond right now. Please try again shortly.');
    }
    if (!response.body) throw new Error('Baza IRONA could not start a streamed response. Please try again.');
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let sources = [];
    let streamError = '';
    const handleChunk = block => {
      const dataLine = block.split(/\r?\n/).find(line => line.startsWith('data:'));
      if (!dataLine) return;
      let event;
      try { event = JSON.parse(dataLine.slice(5).trim()); } catch { return; }
      if (event.type === 'token') { fullAnswer += String(event.text || ''); startTyping(); }
      if (event.type === 'done') sources = Array.isArray(event.sources) ? event.sources : [];
      if (event.type === 'error') streamError = event.error || 'Baza IRONA could not respond right now. Please try again shortly.';
    };
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
      const blocks = buffer.split(/\r?\n\r?\n/);
      buffer = blocks.pop() || '';
      blocks.forEach(handleChunk);
      if (done) { if (buffer.trim()) handleChunk(buffer); break; }
    }
    if (streamError) throw new Error(streamError);
    await drainTyping();
    thinking.remove();
    if (!responseMessage && fullAnswer.trim()) { ensureResponseMessage(); responseMessage.textContent = cleanAssistantResponse(fullAnswer); scrollChatToLatest(); }
    if (responseMessage) {
      responseMessage.classList.remove('typing-message');
      appendChatSources(responseMessage, sources);
      scrollChatToLatest();
      chatHistory.push({ role: 'assistant', content: responseMessage.textContent });
      chatHistory = chatHistory.slice(-8);
    } else addChatMessage('Baza IRONA did not return a text answer. Please try again.', 'assistant');
  } catch (error) {
    if (typingFrame) cancelAnimationFrame(typingFrame);
    typingFrame = 0;
    if (resolveTypingDrain) { resolveTypingDrain(); resolveTypingDrain = null; }
    chatHistory.pop();
    thinking.remove();
    if (responseMessage) responseMessage.classList.remove('typing-message');
    const friendlyError = error instanceof TypeError ? "Couldn't reach the IRONA website server. Check that it is running, then try again." : (error.message || 'Baza IRONA could not respond right now. Please try again shortly.');
    addChatMessage(friendlyError, 'assistant');
  } finally {
    chatBusy = false; input.placeholder = originalPlaceholder;
    if (submit) submit.disabled = false;
    $$('[data-chat-prompt]').forEach(button => { button.disabled = false; });
    if (chatPanel.classList.contains('open') && document.activeElement !== input) input.focus();
  }
}
chatLauncher.addEventListener('click', () => setChatOpen(chatLauncher.getAttribute('aria-expanded') !== 'true'));
$('.chat-close').addEventListener('click', () => setChatOpen(false));
$('#chat-form').addEventListener('submit', event => { event.preventDefault(); if (chatBusy) return; const input = $('#chat-input'); const message = input.value; sendChat(message); input.value = ''; });
$$('[data-chat-prompt]').forEach(button => button.addEventListener('click', () => { if (!chatBusy) sendChat(button.dataset.chatPrompt, true); }));

const insightsTrigger = $('.nav-dropdown-trigger');
if (insightsTrigger) {
  insightsTrigger.addEventListener('click', () => {
    const open = insightsTrigger.getAttribute('aria-expanded') === 'true';
    insightsTrigger.setAttribute('aria-expanded', String(!open));
  });
  document.addEventListener('click', event => {
    if (!event.target.closest('.nav-dropdown')) insightsTrigger.setAttribute('aria-expanded', 'false');
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') { insightsTrigger.setAttribute('aria-expanded', 'false'); insightsTrigger.focus(); }
  });
}

// The homepage hero plays one edited, silent film behind its fixed copy.
(() => {
  const hero = $('.hero-final');
  const scene = $('.hero-final .hero-scene');
  const video = $('.hero-sequence-video', scene);
  if (!hero || !scene || !video) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || navigator.connection?.saveData) return;

  let inViewport = true;
  const start = () => {
    if (!inViewport || document.hidden || video.readyState < HTMLMediaElement.HAVE_FUTURE_DATA) return;
    video.play().then(() => { video.classList.add('is-active'); scene.classList.add('has-video'); }).catch(() => {});
  };
  video.addEventListener('canplay', start, { once: true });
  video.load();
  const visibilityObserver = new IntersectionObserver(entries => {
    inViewport = entries[0].isIntersecting;
    if (!inViewport || document.hidden) video.pause();
    else start();
  }, { threshold: .05 });
  visibilityObserver.observe(hero);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) video.pause();
    else start();
  });
})();
