const root = document.querySelector('#content-detail');
const safe = value => String(value || '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const pretty = value => value ? new Intl.DateTimeFormat('en', { timeZone: 'Africa/Kigali', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(value)) : '';
const eventClock = value => value ? new Intl.DateTimeFormat('en', { timeZone: 'Africa/Kigali', hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(value)) : '';
const eventStatus = item => { const value = item.endsAt || item.startsAt; return value && new Date(value).getTime() < Date.now() ? 'completed' : 'upcoming'; };
const eventSchedule = item => {
  if (!item.startsAt) return 'Date to be announced';
  const startDate = pretty(item.startsAt), endDate = item.endsAt ? pretty(item.endsAt) : '';
  const startTime = eventClock(item.startsAt), endTime = eventClock(item.endsAt);
  const startDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Kigali', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(item.startsAt));
  const endDay = item.endsAt ? new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Kigali', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(item.endsAt)) : '';
  if (!item.endsAt) return `${startDate}${startTime ? ` · ${startTime}` : ''}`;
  if (startDay === endDay) return `${startDate} · ${startTime} to ${endTime}`;
  return `${startDate}${startTime ? ` · ${startTime}` : ''} to ${endDate}${endTime ? ` · ${endTime}` : ''}`;
};
const renderBody = value => {
  const lines = String(value || '').replace(/\r/g, '').split('\n'); let html = '', paragraph = [], list = [];
  const flushP = () => { if (paragraph.length) { html += `<p>${safe(paragraph.join(' '))}</p>`; paragraph = []; } };
  const flushL = () => { if (list.length) { html += `<ul>${list.map(line => `<li>${safe(line)}</li>`).join('')}</ul>`; list = []; } };
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { flushP(); flushL(); continue; }
    if (/^#{1,3}\s/.test(line)) { flushP(); flushL(); html += `<h2>${safe(line.replace(/^#{1,3}\s*/, ''))}</h2>`; continue; }
    if (/^[-*•]\s*/.test(line)) { flushP(); list.push(line.replace(/^[-*•]\s*/, '')); continue; }
    flushL(); paragraph.push(line);
  }
  flushP(); flushL(); return html;
};
document.querySelectorAll('#content-year, #year').forEach(node => { node.textContent = new Date().getFullYear(); });
const menuToggle = document.querySelector('.menu-toggle');
const mainNav = document.querySelector('.main-nav');
menuToggle?.addEventListener('click', () => {
  const open = mainNav.classList.toggle('open');
  menuToggle.setAttribute('aria-expanded', String(open));
  menuToggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
});
document.querySelectorAll('.nav-dropdown-trigger').forEach(trigger => trigger.addEventListener('click', () => trigger.setAttribute('aria-expanded', String(trigger.getAttribute('aria-expanded') !== 'true'))));
document.addEventListener('click', event => {
  if (!event.target.closest('.nav-dropdown')) document.querySelectorAll('.nav-dropdown-trigger').forEach(trigger => trigger.setAttribute('aria-expanded', 'false'));
  if (event.target.closest('.main-nav a') && mainNav) { mainNav.classList.remove('open'); menuToggle?.setAttribute('aria-expanded', 'false'); }
});
(async () => {
  const id = new URLSearchParams(location.search).get('id');
  if (!id) { root.innerHTML = '<section class="article-error"><h1>Choose a story to read</h1><p>Browse IRONA insights and activities.</p><a href="/insights.html">Explore Insights</a></section>'; return; }
  try {
    const response = await fetch(`/api/content/${encodeURIComponent(id)}`);
    const data = await response.json(); if (!response.ok) throw new Error(data.error || 'This content is not available.');
    const item = data.item; const isEvent = item.type === 'event'; const isInsight = ['publication', 'news'].includes(item.type);
    document.querySelector('.nav-dropdown-trigger')?.classList.toggle('is-current', isEvent || isInsight);
    document.title = `${item.title} | Irona Consultants`;
    if (isInsight) root.classList.add('insight-detail');
    const date = isEvent ? item.startsAt : item.publishAt || item.createdAt;
    const backUrl = isEvent ? '/events.html' : '/insights.html'; const backText = isEvent ? 'Events & activities' : 'Insights';
    const activityState = isEvent ? eventStatus(item) : '';
    const metadata = [item.author || 'IRONA Consultants', pretty(date), isInsight ? `${Math.max(1, item.readingTime || 1)} min read` : ''].filter(Boolean);
    const content = item.content || item.summary || '';
    const photo = item.image ? `<figure class="${isEvent ? 'event-cover' : 'article-hero'}"><img src="${safe(item.image)}" alt="${safe(item.imageAlt || '')}" loading="eager">${String(item.imageCaption || '').trim() ? `<figcaption class="article-photo-caption">${safe(item.imageCaption.trim())}</figcaption>` : ''}</figure>` : '';
    const registration = isEvent && activityState === 'upcoming' && item.registrationUrl ? `<aside class="event-registration-card"><div class="event-registration-copy"><span class="event-registration-kicker">REGISTRATION</span><h2>Join this activity</h2><p>Registration is open through our partner form.</p></div><a href="${safe(item.registrationUrl)}" target="_blank" rel="noopener noreferrer">Register <span aria-hidden="true">&#8599;</span></a></aside>` : '';
    const report = isInsight && item.downloadUrl ? `<section class="insight-report-panel"><div><span class="article-type-pill">REPORT</span><h2>${safe(item.title)}</h2><p>Read or download the full report.</p></div><div class="insight-report-actions"><a href="${safe(item.downloadUrl)}" target="_blank" rel="noopener noreferrer">Preview PDF <span aria-hidden="true">&#8599;</span></a><a href="${safe(item.downloadUrl)}" download>Download PDF <span aria-hidden="true">&#8595;</span></a></div></section>` : '';
    const outcomes = isEvent && String(item.outcomes || '').trim() ? `<section class="article-outcomes"><h2>Activity outcomes</h2>${renderBody(item.outcomes)}</section>` : '';
    const sections = isInsight && Array.isArray(item.articleSections) && item.articleSections.length
      ? item.articleSections.map(section => `<section class="article-content-section">${section.heading ? `<h2>${safe(section.heading)}</h2>` : ''}${renderBody(section.body)}</section>`).join('')
      : renderBody(content);
    const gallery = isInsight && Array.isArray(item.galleryImages) && item.galleryImages.length
      ? `<section class="insight-gallery"><h2>In pictures</h2><div class="insight-gallery-grid">${item.galleryImages.map(photo => `<figure><img src="${safe(photo.image)}" alt="${safe(photo.alt || '')}" loading="lazy">${photo.caption ? `<figcaption>${safe(photo.caption)}</figcaption>` : ''}</figure>`).join('')}</div></section>` : '';
    const eventGallery = isEvent && Array.isArray(item.galleryImages) && item.galleryImages.length
      ? `<section class="event-photo-gallery"><h2>More from the activity</h2><div class="insight-gallery-grid event-gallery-grid" data-count="${item.galleryImages.length}">${item.galleryImages.map(photo => `<figure><img src="${safe(photo.image)}" alt="${safe(photo.alt || '')}" loading="lazy">${String(photo.caption || '').trim() ? `<figcaption>${safe(photo.caption.trim())}</figcaption>` : ''}</figure>`).join('')}</div></section>` : '';
    if (isEvent) {
      root.classList.add('event-detail');
      const facts = [
        ['Date and time', eventSchedule(item)],
        ['Venue', item.venue],
        ['Location', item.location],
        ['Organised by', item.organizers],
      ].filter(([, value]) => String(value || '').trim());
      const factsMarkup = facts.length ? `<dl class="event-facts">${facts.map(([label, value]) => `<div><dt>${safe(label)}</dt><dd>${safe(String(value).trim())}</dd></div>`).join('')}</dl>` : '';
      const descriptionMarkup = String(item.content || '').trim() ? `<section class="event-description"><h2>About this activity</h2><div class="detail-body">${sections}</div></section>` : '';
      const cleanTitle = String(item.title || '').replace(/\s+([,.;:!?])/g, '$1').replace(/\s+/g, ' ').trim();
      root.innerHTML = `<article class="event-journal"><div class="event-journal-back"><a class="detail-back" href="${backUrl}">&larr; Events &amp; activities</a></div>${photo}<header class="event-detail-heading"><div class="event-detail-labels"><span class="article-type-pill">${safe(item.activityType || 'Activity')}</span><span class="event-detail-status ${activityState}"><i aria-hidden="true"></i>${activityState === 'upcoming' ? 'Upcoming' : 'Completed'}</span></div><h1>${safe(cleanTitle)}</h1>${String(item.summary || '').trim() ? `<p class="detail-deck">${safe(item.summary.trim())}</p>` : ''}</header>${factsMarkup}${registration}${descriptionMarkup}${outcomes}${eventGallery}</article>`;
    } else {
      root.innerHTML = `<article class="article-panel"><a class="detail-back" href="${backUrl}">&larr; Back to ${backText}</a>${photo}<div class="article-heading"><span class="article-type-pill">${safe(item.category || 'Insight')}</span><h1>${safe(item.title)}</h1>${item.summary ? `<p class="detail-deck">${safe(item.summary)}</p>` : ''}<div class="detail-meta">${metadata.map(value => `<span>${safe(value)}</span>`).join('')}</div></div><div class="detail-body">${sections}</div>${gallery}${report}</article><section class="related-section" id="related-stories" hidden></section>`;
    }
    if (isInsight) {
      try {
        const related = await fetch('/api/content?type=insight').then(r => r.json());
        const others = (related.content || []).filter(entry => entry.id !== item.id).slice(0, 3);
        const section = document.querySelector('#related-stories');
        if (others.length) {
          section.hidden = false; section.innerHTML = `<div class="related-inner"><h2>Related insights</h2><div class="public-grid">${others.map(entry => `<article class="public-story-card"><a class="story-image-wrap" href="/content.html?id=${encodeURIComponent(entry.id)}"><img class="story-image" src="${safe(entry.image || '/assets/blue-celebrating-15-years-impact.png')}" alt="${safe(entry.imageAlt || '')}" loading="lazy"></a><div class="story-copy"><div class="story-kicker"><span>${safe(entry.category || 'Insight')}</span><span>${safe(pretty(entry.publishAt || entry.createdAt))}</span></div><h3><a href="/content.html?id=${encodeURIComponent(entry.id)}">${safe(entry.title)}</a></h3><p>${safe(entry.summary || '')}</p><div class="story-foot"><span>${Math.max(1, entry.readingTime || 1)} min read</span><a href="/content.html?id=${encodeURIComponent(entry.id)}">View insight &rarr;</a></div></div></article>`).join('')}</div></div>`;
        }
      } catch { /* Related content is optional; keep the article readable if the feed is unavailable. */ }
    }
  } catch (error) { root.innerHTML = `<section class="article-error"><h1>We couldn't find that item</h1><p>${safe(error.message)}</p><a href="/insights.html">Return to IRONA Insights</a></section>`; }
})();
