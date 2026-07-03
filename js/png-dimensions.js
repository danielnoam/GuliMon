// Reads width/height straight from a PNG's IHDR chunk. No dependencies —
// shared by functions/api/submit.js (Workers runtime, where npm packages
// built on Node's `fs`/Buffer aren't a great fit) and
// .github/scripts/validate-submission.mjs (Node, but this avoids an
// `npm install` step on every PR). Every image in this project is a PNG
// (see js/schema.js's IMAGE_PATTERN), so that's the only format handled.
export function readPngDimensions(bytes) {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.byteLength < 24) return null;
  for (let i = 0; i < signature.length; i++) {
    if (bytes[i] !== signature[i]) return null;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16, false), height: view.getUint32(20, false) };
}
