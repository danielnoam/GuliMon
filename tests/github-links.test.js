import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  slugify,
  generateId,
  buildForkUrl,
  buildUploadUrl,
  buildCreateFileUrl,
  buildCreateFileUrlWithTruncation,
  buildCompareUrl,
} from '../js/github-links.js';

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

test('buildForkUrl points at the canonical repo fork endpoint', () => {
  assert.equal(buildForkUrl('acme', 'GuliMon'), 'https://github.com/acme/GuliMon/fork');
});

test('buildUploadUrl points at the visitor fork upload endpoint', () => {
  assert.equal(
    buildUploadUrl('oct o cat', 'GuliMon', 'main'),
    'https://github.com/oct%20o%20cat/GuliMon/upload/main/submissions'
  );
});

test('buildCreateFileUrl pre-fills filename and JSON value', () => {
  const entry = { id: 'pyro-fox-x7k2', name: 'Pyro Fox' };
  const url = buildCreateFileUrl('octocat', 'GuliMon', 'main', 'pyro-fox-x7k2', entry);
  assert.match(url, /^https:\/\/github\.com\/octocat\/GuliMon\/new\/main\/submissions\?/);
  assert.match(url, /filename=submissions%2Fpyro-fox-x7k2\.json/);
  const valueParam = new URL(url).searchParams.get('value');
  assert.deepEqual(JSON.parse(valueParam), entry);
});

test('buildCreateFileUrlWithTruncation leaves short entries untouched', () => {
  const entry = { id: 'a-1234', name: 'A', description: 'short' };
  const result = buildCreateFileUrlWithTruncation('octocat', 'GuliMon', 'main', 'a-1234', entry, 8000);
  assert.equal(result.truncated, false);
  assert.equal(result.entry.description, 'short');
});

test('buildCreateFileUrlWithTruncation shortens description until under the cap', () => {
  const entry = { id: 'a-1234', name: 'A', description: 'x'.repeat(5000) };
  const result = buildCreateFileUrlWithTruncation('octocat', 'GuliMon', 'main', 'a-1234', entry, 500);
  assert.equal(result.truncated, true);
  assert.ok(result.url.length <= 500, `expected url.length <= 500, got ${result.url.length}`);
  assert.ok(result.entry.description.length < 5000);
});

test('buildCompareUrl builds a fork-compare PR link', () => {
  assert.equal(
    buildCompareUrl('acme', 'GuliMon', 'octocat', 'main'),
    'https://github.com/acme/GuliMon/compare/main...octocat:GuliMon:main?expand=1'
  );
});
