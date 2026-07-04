import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bytesToBase64, base64ToBytes } from '../functions/_shared/github.js';

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

test('base64ToBytes round-trips with bytesToBase64', () => {
  const original = new Uint8Array([0, 1, 2, 250, 251, 252, 253, 254, 255]);
  assert.deepEqual(base64ToBytes(bytesToBase64(original)), original);
});
