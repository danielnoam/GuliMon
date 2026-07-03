import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readPngDimensions } from '../js/png-dimensions.js';

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
