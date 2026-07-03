import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readPngDimensions, bytesToBase64 } from '../functions/api/submit.js';

function fakePngHeader(width, height) {
  const bytes = new Uint8Array(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0); // signature
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width, false);
  view.setUint32(20, height, false);
  return bytes;
}

test('readPngDimensions reads width/height from the IHDR chunk', () => {
  const dims = readPngDimensions(fakePngHeader(512, 307));
  assert.deepEqual(dims, { width: 512, height: 307 });
});

test('readPngDimensions rejects a non-PNG signature', () => {
  const bytes = fakePngHeader(512, 512);
  bytes[0] = 0x00;
  assert.equal(readPngDimensions(bytes), null);
});

test('readPngDimensions rejects a buffer that is too short', () => {
  assert.equal(readPngDimensions(new Uint8Array(10)), null);
});

test('bytesToBase64 round-trips through atob', () => {
  const original = new Uint8Array([0, 1, 2, 250, 251, 252, 253, 254, 255]);
  const encoded = bytesToBase64(original);
  const decoded = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
  assert.deepEqual(decoded, original);
});

test('bytesToBase64 handles buffers larger than one chunk', () => {
  const original = new Uint8Array(100000).map((_, i) => i % 256);
  const encoded = bytesToBase64(original);
  const decoded = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
  assert.deepEqual(decoded, original);
});
