import {
  generateId,
  buildForkUrl,
  buildUploadUrl,
  buildCreateFileUrlWithTruncation,
  buildCompareUrl,
} from './github-links.js';
import { validateEntry, MAX_NAME_LEN, MAX_DESCRIPTION_LEN } from './schema.js';

const OWNER = 'danielnoam1999';
const REPO = 'GuliMon';
const BRANCH = 'main';
const MAX_IMAGE_DIM = 512;
const MAX_IMAGE_BYTES = 500 * 1024;
const PENDING_KEY = 'gulimon_pending';

const form = document.getElementById('submit-form');
const nameInput = document.getElementById('field-name');
const descriptionInput = document.getElementById('field-description');
const usernameInput = document.getElementById('field-username');
const fileInput = document.getElementById('field-image');
const descCounter = document.getElementById('description-counter');
const formErrors = document.getElementById('form-errors');
const previewCanvas = document.getElementById('preview-canvas');
const previewNote = document.getElementById('preview-note');
const generateBtn = document.getElementById('generate-btn');
const startOverBtn = document.getElementById('start-over-btn');

const formSection = document.getElementById('form-section');
const stepsSection = document.getElementById('steps-section');

const downloadBtn = document.getElementById('step-download-btn');
const forkLink = document.getElementById('step-fork-link');
const uploadLink = document.getElementById('step-upload-link');
const uploadDoneCheck = document.getElementById('step-upload-done');
const createLink = document.getElementById('step-create-link');
const createDoneCheck = document.getElementById('step-create-done');
const prLink = document.getElementById('step-pr-link');
const truncationWarning = document.getElementById('truncation-warning');
const pendingSavedNote = document.getElementById('pending-saved-note');

let compressedBlob = null;
let downloadHappened = false;

descriptionInput.maxLength = MAX_DESCRIPTION_LEN;
nameInput.maxLength = MAX_NAME_LEN;

descriptionInput.addEventListener('input', () => {
  descCounter.textContent = `${descriptionInput.value.length} / ${MAX_DESCRIPTION_LEN}`;
});
descCounter.textContent = `0 / ${MAX_DESCRIPTION_LEN}`;

fileInput.addEventListener('change', async () => {
  const file = fileInput.files[0];
  if (!file) return;
  previewNote.textContent = 'Processing image…';
  try {
    compressedBlob = await resizeImageToBlob(file, MAX_IMAGE_DIM, MAX_IMAGE_BYTES);
    previewNote.textContent = `Ready — ${previewCanvas.width}×${previewCanvas.height}px, ${(compressedBlob.size / 1024).toFixed(0)}KB`;
  } catch (err) {
    previewNote.textContent = `Could not process that image: ${err.message}`;
    compressedBlob = null;
  }
});

async function resizeImageToBlob(file, maxDim, maxBytes) {
  const img = await loadImage(file);
  let scale = Math.min(1, maxDim / Math.max(img.width, img.height));
  const ctx = previewCanvas.getContext('2d');

  for (let attempt = 0; attempt < 6; attempt++) {
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    previewCanvas.width = w;
    previewCanvas.height = h;
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);

    const blob = await new Promise((resolve) => previewCanvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('canvas export failed');
    if (blob.size <= maxBytes || w <= 64 || h <= 64) {
      return blob;
    }
    scale *= 0.85; // still too big — shrink further and retry
  }
  throw new Error('image could not be compressed under the size cap');
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('unreadable image file'));
    img.src = URL.createObjectURL(file);
  });
}

let currentSubmission = null; // { id, entry, blob }

form.addEventListener('submit', (event) => {
  event.preventDefault();
  formErrors.textContent = '';

  const name = nameInput.value.trim();
  const description = descriptionInput.value.trim();
  const username = usernameInput.value.trim().replace(/^@/, '');

  const problems = [];
  if (!name) problems.push('Gilguli name is required.');
  if (!username) problems.push('Your GitHub username is required.');
  if (!compressedBlob) problems.push('Please choose an image.');

  if (problems.length > 0) {
    formErrors.textContent = problems.join(' ');
    return;
  }

  const id = generateId(name);
  const entry = {
    id,
    name,
    ...(description ? { description } : {}),
    uploaderGithubUsername: username,
    image: `${id}.png`,
    createdAt: new Date().toISOString(),
  };

  const { errors } = validateEntry(entry, id);
  if (errors.length > 0) {
    formErrors.textContent = `Internal validation error: ${errors.join('; ')}`;
    return;
  }

  currentSubmission = { id, entry, blob: compressedBlob, username };
  savePending(currentSubmission);
  renderSteps(currentSubmission);

  formSection.hidden = true;
  stepsSection.hidden = false;
});

function savePending({ id, entry }) {
  const pending = readPending();
  const imageDataUrl = previewCanvas.toDataURL('image/png');
  const withoutExisting = pending.filter((p) => p.id !== id);
  withoutExisting.push({ ...entry, imageDataUrl });
  localStorage.setItem(PENDING_KEY, JSON.stringify(withoutExisting));
  pendingSavedNote.hidden = false;
}

function readPending() {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function renderSteps({ id, entry, blob, username }) {
  downloadHappened = false;
  uploadDoneCheck.checked = false;
  createDoneCheck.checked = false;

  downloadBtn.onclick = () => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${id}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    downloadHappened = true;
    updateGating();
  };

  forkLink.href = buildForkUrl(OWNER, REPO);
  uploadLink.href = buildUploadUrl(username, REPO, BRANCH);

  const { url: createUrl, truncated } = buildCreateFileUrlWithTruncation(username, REPO, BRANCH, id, entry);
  createLink.href = createUrl;
  truncationWarning.hidden = !truncated;

  prLink.href = buildCompareUrl(OWNER, REPO, username, BRANCH);

  updateGating();
}

function updateGating() {
  // Step 1 (fork) has no prerequisites once the form is submitted.
  forkLink.classList.remove('is-disabled');

  // Step 2/3 need the image downloaded first (it's what gets uploaded to GitHub).
  const canUploadOrCreate = downloadHappened;
  setLinkEnabled(uploadLink, canUploadOrCreate);
  setLinkEnabled(createLink, canUploadOrCreate);
  uploadDoneCheck.disabled = !canUploadOrCreate;
  createDoneCheck.disabled = !canUploadOrCreate;

  // Step 4 (open PR) needs both prior steps self-confirmed complete, since
  // we have no way to verify fork/file state without burning API rate limit.
  const canOpenPr = uploadDoneCheck.checked && createDoneCheck.checked;
  setLinkEnabled(prLink, canOpenPr);
}

uploadDoneCheck.addEventListener('change', updateGating);
createDoneCheck.addEventListener('change', updateGating);

function setLinkEnabled(anchor, enabled) {
  anchor.classList.toggle('is-disabled', !enabled);
  if (enabled) {
    anchor.removeAttribute('aria-disabled');
  } else {
    anchor.setAttribute('aria-disabled', 'true');
  }
}

document.querySelectorAll('.step-link').forEach((anchor) => {
  anchor.addEventListener('click', (event) => {
    if (anchor.classList.contains('is-disabled')) event.preventDefault();
  });
});

startOverBtn.addEventListener('click', () => {
  form.reset();
  compressedBlob = null;
  currentSubmission = null;
  previewNote.textContent = '';
  descCounter.textContent = `0 / ${MAX_DESCRIPTION_LEN}`;
  pendingSavedNote.hidden = true;
  formSection.hidden = false;
  stepsSection.hidden = true;
});
