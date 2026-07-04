import { resizeImageToBlob } from './image-compress.js';

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

function formatDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function datesLine(entry) {
  const parts = [];
  if (entry.createdAt) parts.push(`Uploaded ${formatDate(entry.createdAt)}`);
  if (entry.updatedAt) parts.push(`edited ${formatDate(entry.updatedAt)}`);
  return parts.length ? `<p class="card-dates">${parts.join(' · ')}</p>` : '';
}

function publicCard(entry) {
  return `
    <article class="card" data-id="${escapeHtml(entry.id)}">
      <img class="card-image" src="submissions/${encodeURIComponent(entry.image)}" alt="${escapeHtml(entry.name)}" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'card-image card-image-fallback',textContent:'?'}))">
      <div class="card-body">
        <h3 class="card-title">${escapeHtml(entry.name)}</h3>
        ${entry.description ? `<p class="card-description">${escapeHtml(entry.description)}</p>` : ''}
        ${entry.uploaderName ? `<p class="card-meta">by ${escapeHtml(entry.uploaderName)}</p>` : ''}
        ${datesLine(entry)}
        ${editControls(entry)}
      </div>
    </article>`;
}

function editControls(entry) {
  return `
    <div class="card-actions">
      <button type="button" class="btn-edit-public" data-id="${escapeHtml(entry.id)}">Edit</button>
      <button type="button" class="btn-remove-public" data-id="${escapeHtml(entry.id)}">Remove</button>
    </div>
    <form class="edit-form" data-id="${escapeHtml(entry.id)}" hidden novalidate>
      <div class="field">
        <label>Name</label>
        <input name="name" type="text" maxlength="40" value="${escapeHtml(entry.name)}" required>
      </div>
      <div class="field">
        <label>Description</label>
        <textarea name="description" rows="2" maxlength="300">${escapeHtml(entry.description ?? '')}</textarea>
      </div>
      <div class="field">
        <label>Uploader name</label>
        <input name="uploaderName" type="text" maxlength="40" value="${escapeHtml(entry.uploaderName ?? '')}">
      </div>
      <div class="field">
        <label>Replace image <span class="optional">(optional)</span></label>
        <input name="image" type="file" accept="image/*">
      </div>
      <p class="edit-error form-errors" hidden></p>
      <div class="card-actions">
        <button type="submit" class="btn btn-primary">Save</button>
        <button type="button" class="btn-cancel-edit">Cancel</button>
      </div>
    </form>`;
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
        ${datesLine(entry)}
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

publicGrid.addEventListener('click', async (event) => {
  const target = event.target;

  if (target.classList.contains('btn-edit-public')) {
    const id = target.dataset.id;
    const form = publicGrid.querySelector(`.edit-form[data-id="${CSS.escape(id)}"]`);
    if (form) form.hidden = !form.hidden;
    return;
  }

  if (target.classList.contains('btn-cancel-edit')) {
    target.closest('.edit-form').hidden = true;
    return;
  }

  if (target.classList.contains('btn-remove-public')) {
    const id = target.dataset.id;
    if (!confirm('Remove this Gilguli from the GuliDex? This cannot be undone from here.')) return;

    target.disabled = true;
    try {
      const body = new FormData();
      body.set('id', id);
      body.set('action', 'delete');
      const res = await fetch('/api/edit', { method: 'POST', body });
      const result = await res.json();
      if (!res.ok || !result.ok) throw new Error(result.error || `Remove failed (${res.status})`);
      await refresh();
    } catch (err) {
      alert(`Could not remove: ${err.message}`);
      target.disabled = false;
    }
  }
});

publicGrid.addEventListener('submit', async (event) => {
  const form = event.target;
  if (!form.classList.contains('edit-form')) return;
  event.preventDefault();

  const id = form.dataset.id;
  const errorNote = form.querySelector('.edit-error');
  const saveBtn = form.querySelector('button[type="submit"]');
  errorNote.hidden = true;

  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving…';

  try {
    const body = new FormData();
    body.set('id', id);
    body.set('action', 'update');
    body.set('name', form.elements.name.value.trim());
    body.set('description', form.elements.description.value.trim());
    body.set('uploaderName', form.elements.uploaderName.value.trim());

    const imageFile = form.elements.image.files[0];
    if (imageFile) {
      const canvas = document.createElement('canvas');
      const blob = await resizeImageToBlob(imageFile, canvas);
      body.set('image', blob, 'image.png');
    }

    const res = await fetch('/api/edit', { method: 'POST', body });
    const result = await res.json();
    if (!res.ok || !result.ok) throw new Error(result.error || `Save failed (${res.status})`);

    await refresh();
  } catch (err) {
    errorNote.hidden = false;
    errorNote.textContent = `Could not save: ${err.message}`;
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save';
  }
});

refresh().catch((err) => {
  publicEmpty.hidden = false;
  publicEmpty.textContent = `Could not load the GuliDex: ${err.message}`;
});
