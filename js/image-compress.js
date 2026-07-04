// Client-side image resize/compress, shared by the submission form
// (js/submit.js) and the GuliDex's inline edit form (js/dex.js).
export const MAX_IMAGE_DIM = 512;
export const MAX_IMAGE_BYTES = 500 * 1024;

export async function resizeImageToBlob(file, canvas, maxDim = MAX_IMAGE_DIM, maxBytes = MAX_IMAGE_BYTES) {
  const img = await loadImage(file);
  let scale = Math.min(1, maxDim / Math.max(img.width, img.height));
  const ctx = canvas.getContext('2d');

  for (let attempt = 0; attempt < 6; attempt++) {
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    canvas.width = w;
    canvas.height = h;
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
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
