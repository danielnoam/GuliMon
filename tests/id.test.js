import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slugify, generateId } from '../js/id.js';

test('slugify lowercases, hyphenates, and strips punctuation', () => {
  assert.equal(slugify('Pyro Fox!'), 'pyro-fox');
  assert.equal(slugify('  leading/trailing  '), 'leading-trailing');
  assert.equal(slugify('Café Ümlaut'), 'cafe-umlaut');
});

test('slugify falls back to a default when nothing survives', () => {
  assert.equal(slugify('!!!'), 'gilguli');
  assert.equal(slugify(''), 'gilguli');
});

test('generateId appends the given suffix to the slug', () => {
  assert.equal(generateId('Pyro Fox', 'x7k2'), 'pyro-fox-x7k2');
});
