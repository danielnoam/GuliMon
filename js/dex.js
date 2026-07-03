const PENDING_KEY = 'gulimon_pending';

const publicGrid = document.getElementById('public-grid');
const publicEmpty = document.getElementById('public-empty');
const pendingSection = document.getElementById('pending-section');
const pendingGrid = document.getElementById('pending-grid');

function readPending() {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writePending(list) {
  localStorage.setItem(PENDING_KEY, JSON.stringify(list));
}

async function fetchDex({ bypassCache = false } = {}) {
  const url = bypassCache ? `data/dex.json?_=${Date.now()}` : 'data/dex.json';
  const res = await fetch(url, { cache: bypassCache ? 'no-store' : 'default' });
  if (!res.ok) throw new Error(`Failed to load dex.json (${res.status})`);
  return res.json();
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function publicCard(entry) {
  return `
    <article class="card">
      <img class="card-image" src="submissions/${encodeURIComponent(entry.image)}" alt="${escapeHtml(entry.name)}" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'card-image card-image-fallback',textContent:'?'}))">
      <div class="card-body">
        <h3 class="card-title">${escapeHtml(entry.name)}</h3>
        ${entry.description ? `<p class="card-description">${escapeHtml(entry.description)}</p>` : ''}
        ${entry.uploaderName ? `<p class="card-meta">by ${escapeHtml(entry.uploaderName)}</p>` : ''}
      </div>
    </article>`;
}

function pendingCard(entry) {
  return `
    <article class="card card-pending" data-id="${escapeHtml(entry.id)}">
      <span class="badge badge-pending">Pending review</span>
      <img class="card-image" src="${entry.imageDataUrl ?? ''}" alt="${escapeHtml(entry.name)}">
      <div class="card-body">
        <h3 class="card-title">${escapeHtml(entry.name)}</h3>
        ${entry.description ? `<p class="card-description">${escapeHtml(entry.description)}</p>` : ''}
        ${entry.uploaderName ? `<p class="card-meta">by ${escapeHtml(entry.uploaderName)}</p>` : ''}
        <div class="card-actions">
          <button type="button" class="btn-status" data-id="${escapeHtml(entry.id)}">Check status</button>
          <button type="button" class="btn-remove" data-id="${escapeHtml(entry.id)}">Remove</button>
        </div>
        <p class="card-status-note" data-id="${escapeHtml(entry.id)}" hidden></p>
      </div>
    </article>`;
}

function renderPublic(entries) {
  if (entries.length === 0) {
    publicEmpty.hidden = false;
    publicGrid.innerHTML = '';
    return;
  }
  publicEmpty.hidden = true;
  publicGrid.innerHTML = entries.map(publicCard).join('');
}

function renderPending(entries) {
  if (entries.length === 0) {
    pendingSection.hidden = true;
    pendingGrid.innerHTML = '';
    return;
  }
  pendingSection.hidden = false;
  pendingGrid.innerHTML = entries.map(pendingCard).join('');
}

async function refresh() {
  const dex = await fetchDex();
  renderPublic(dex.entries);
  const publicIds = new Set(dex.entries.map((e) => e.id));
  renderPending(readPending().filter((p) => !publicIds.has(p.id)));
}

pendingGrid.addEventListener('click', async (event) => {
  const target = event.target;
  if (target.classList.contains('btn-remove')) {
    const id = target.dataset.id;
    writePending(readPending().filter((p) => p.id !== id));
    await refresh();
    return;
  }

  if (target.classList.contains('btn-status')) {
    const id = target.dataset.id;
    const note = pendingGrid.querySelector(`.card-status-note[data-id="${CSS.escape(id)}"]`);
    target.disabled = true;
    if (note) {
      note.hidden = false;
      note.textContent = 'Checking…';
    }
    try {
      const dex = await fetchDex({ bypassCache: true });
      const merged = dex.entries.some((e) => e.id === id);
      if (merged) {
        writePending(readPending().filter((p) => p.id !== id));
        await refresh();
      } else if (note) {
        note.textContent = 'Not merged yet — check back after the PR is approved and merged.';
        target.disabled = false;
      }
    } catch (err) {
      if (note) note.textContent = `Could not check status: ${err.message}`;
      target.disabled = false;
    }
  }
});

refresh().catch((err) => {
  publicEmpty.hidden = false;
  publicEmpty.textContent = `Could not load the GuliDex: ${err.message}`;
});
