import { MAX_NAME_LEN, MAX_DESCRIPTION_LEN, MAX_UPLOADER_NAME_LEN } from './schema.js';

const MAX_IMAGE_DIM = 512;
const MAX_IMAGE_BYTES = 500 * 1024;
const PENDING_KEY = 'gulimon_pending';

const form = document.getElementById('submit-form');
const nameInput = document.getElementById('field-name');
const descriptionInput = document.getElementById('field-description');
const uploaderInput = document.getElementById('field-uploader');
const fileInput = document.getElementById('field-image');
const dropzone = document.getElementById('dropzone');
const dropzoneText = document.getElementById('dropzone-text');
const descCounter = document.getElementById('description-counter');
const formErrors = document.getElementById('form-errors');
const previewCanvas = document.getElementById('preview-canvas');
const previewNote = document.getElementById('preview-note');
const submitBtn = document.getElementById('submit-btn');

const formSection = document.getElementById('form-section');
const successSection = document.getElementById('success-section');
const successMessage = document.getElementById('success-message');
const prLinkOut = document.getElementById('success-pr-link');
const submitAnotherBtn = document.getElementById('submit-another-btn');

let compressedBlob = null;

descriptionInput.maxLength = MAX_DESCRIPTION_LEN;
nameInput.maxLength = MAX_NAME_LEN;
uploaderInput.maxLength = MAX_UPLOADER_NAME_LEN;

descriptionInput.addEventListener('input', () => {
  descCounter.textContent = `${descriptionInput.value.length} / ${MAX_DESCRIPTION_LEN}`;
});
descCounter.textContent = `0 / ${MAX_DESCRIPTION_LEN}`;

fileInput.addEventListener('change', () => handleFile(fileInput.files[0]));

['dragenter', 'dragover'].forEach((eventName) => {
  dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropzone.classList.add('is-dragover');
  });
});

['dragleave', 'dragend', 'drop'].forEach((eventName) => {
  dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropzone.classList.remove('is-dragover');
  });
});

dropzone.addEventListener('drop', (event) => {
  const file = event.dataTransfer.files[0];
  if (!file) return;
  // Keeps the real <input> in sync so form submission/reset behave normally.
  const transfer = new DataTransfer();
  transfer.items.add(file);
  fileInput.files = transfer.files;
  handleFile(file);
});

async function handleFile(file) {
  if (!file) return;
  dropzoneText.textContent = file.name;
  previewNote.textContent = 'Processing image…';
  try {
    compressedBlob = await resizeImageToBlob(file, MAX_IMAGE_DIM, MAX_IMAGE_BYTES);
    previewNote.textContent = `Ready — ${previewCanvas.width}×${previewCanvas.height}px, ${(compressedBlob.size / 1024).toFixed(0)}KB`;
  } catch (err) {
    previewNote.textContent = `Could not process that image: ${err.message}`;
    compressedBlob = null;
  }
}

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

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  formErrors.textContent = '';

  const name = nameInput.value.trim();
  const description = descriptionInput.value.trim();
  const uploaderName = uploaderInput.value.trim();

  const problems = [];
  if (!name) problems.push('Gilguli name is required.');
  if (!compressedBlob) problems.push('Please choose an image.');

  if (problems.length > 0) {
    formErrors.textContent = problems.join(' ');
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = 'Submitting…';

  try {
    const imageDataUrl = previewCanvas.toDataURL('image/png');

    const body = new FormData();
    body.set('name', name);
    body.set('description', description);
    body.set('uploaderName', uploaderName);
    body.set('image', compressedBlob, 'image.png');

    const res = await fetch('/api/submit', { method: 'POST', body });
    const result = await res.json();

    if (!res.ok || !result.ok) {
      throw new Error(result.error || `Submission failed (${res.status})`);
    }

    savePending({ ...result.entry, imageDataUrl });
    showSuccess(result);
  } catch (err) {
    formErrors.textContent = `Could not submit: ${err.message}`;
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Submit';
  }
});

function savePending(entryWithPreview) {
  const pending = readPending().filter((p) => p.id !== entryWithPreview.id);
  pending.push(entryWithPreview);
  localStorage.setItem(PENDING_KEY, JSON.stringify(pending));
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

function showSuccess({ entry, prUrl }) {
  successMessage.textContent = `"${entry.name}" was submitted and will appear on the GuliDex automatically once it passes automated checks — usually within a minute or two.`;
  prLinkOut.href = prUrl;
  formSection.hidden = true;
  successSection.hidden = false;
}

submitAnotherBtn.addEventListener('click', () => {
  form.reset();
  compressedBlob = null;
  previewNote.textContent = '';
  dropzoneText.textContent = 'Drag & drop an image, or tap to choose a file or take a photo';
  descCounter.textContent = `0 / ${MAX_DESCRIPTION_LEN}`;
  formErrors.textContent = '';
  formSection.hidden = false;
  successSection.hidden = true;
});
