import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateEntry } from '../js/schema.js';

const validEntry = {
  id: 'pyro-fox-x7k2',
  name: 'Pyro Fox',
  description: 'A small ember-colored Gilguli.',
  uploaderName: 'octocat',
  image: 'pyro-fox-x7k2.png',
  createdAt: '2026-07-03T00:00:00.000Z',
};

test('accepts a well-formed entry', () => {
  const { errors } = validateEntry(validEntry, 'pyro-fox-x7k2');
  assert.deepEqual(errors, []);
});

test('accepts an entry without optional fields', () => {
  const { description, uploaderName, ...minimal } = validEntry;
  const { errors } = validateEntry(minimal, 'pyro-fox-x7k2');
  assert.deepEqual(errors, []);
});

test('rejects id/filename mismatch', () => {
  const { errors } = validateEntry(validEntry, 'someone-else-a1b2');
  assert.ok(errors.some((e) => e.startsWith('id:')));
});

test('rejects name over the length cap', () => {
  const { errors } = validateEntry({ ...validEntry, name: 'x'.repeat(41) }, validEntry.id);
  assert.ok(errors.some((e) => e.startsWith('name:')));
});

test('rejects description over the length cap', () => {
  const { errors } = validateEntry({ ...validEntry, description: 'x'.repeat(301) }, validEntry.id);
  assert.ok(errors.some((e) => e.startsWith('description:')));
});

test('rejects uploaderName over the length cap', () => {
  const { errors } = validateEntry({ ...validEntry, uploaderName: 'x'.repeat(41) }, validEntry.id);
  assert.ok(errors.some((e) => e.startsWith('uploaderName:')));
});

test('rejects image field that does not match id', () => {
  const { errors } = validateEntry({ ...validEntry, image: 'other.png' }, validEntry.id);
  assert.ok(errors.some((e) => e.startsWith('image:')));
});

test('rejects an invalid createdAt', () => {
  const { errors } = validateEntry({ ...validEntry, createdAt: 'not-a-date' }, validEntry.id);
  assert.ok(errors.some((e) => e.startsWith('createdAt:')));
});

test('rejects missing required fields', () => {
  const { errors } = validateEntry({}, 'anything');
  assert.ok(errors.length >= 3);
});
