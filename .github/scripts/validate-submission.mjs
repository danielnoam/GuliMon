// Runs in validate-submission.yml (pull_request, read-only token — this
// script never writes anything, it only reads diff'd files and prints/exits).
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { imageSize } from 'image-size';
import { validateEntry } from '../../js/schema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE = process.env.GITHUB_WORKSPACE || path.resolve(__dirname, '..', '..');
const BASE_SHA = process.env.BASE_SHA;
const HEAD_SHA = process.env.HEAD_SHA;
const MAX_IMAGE_BYTES = 1024 * 1024; // 1MB
const MAX_IMAGE_DIM = 1024;

if (!BASE_SHA || !HEAD_SHA) {
  console.error('BASE_SHA and HEAD_SHA env vars are required.');
  process.exit(1);
}

function sh(cmd) {
  return execSync(cmd, { encoding: 'utf8', cwd: WORKSPACE }).trim();
}

const results = [];
let hasFailure = false;

function pass(check, detail) {
  results.push({ check, ok: true, detail });
}

function fail(check, detail) {
  results.push({ check, ok: false, detail });
  hasFailure = true;
}

// --- 1. Diff submissions/** between base and head, only "A" (added) allowed.
let diffOutput = '';
try {
  diffOutput = sh(`git diff --name-status ${BASE_SHA} ${HEAD_SHA} -- submissions/`);
} catch (err) {
  fail('Read PR diff', err.message);
}

const lines = diffOutput ? diffOutput.split('\n').filter(Boolean) : [];
const added = [];
const disallowed = [];

for (const line of lines) {
  const parts = line.split('\t');
  const status = parts[0];
  const filePath = parts[parts.length - 1];
  if (!filePath) continue;
  if (status === 'A') {
    added.push(filePath);
  } else {
    disallowed.push(`${filePath} (${status})`);
  }
}

if (disallowed.length > 0) {
  fail('PR only adds files under submissions/', `Modified/deleted/renamed: ${disallowed.join(', ')}`);
} else {
  pass('PR only adds files under submissions/', `${added.length} file(s) added`);
}

const jsonFiles = added.filter((f) => f.endsWith('.json'));
const imageFiles = added.filter((f) => /\.(png|jpe?g|webp)$/i.test(f));

if (jsonFiles.length === 0) {
  fail('At least one submission JSON added', 'No .json files found under submissions/ in this PR');
}

// --- 2. Existing filenames before this PR, for collision checking.
let existingBasenames = new Set();
try {
  const existing = sh(`git ls-tree -r --name-only ${BASE_SHA} -- submissions/`);
  existingBasenames = new Set(existing.split('\n').filter(Boolean).map((f) => path.basename(f)));
} catch {
  // submissions/ may not have existed at base (first-ever submission) — fine.
}

const claimedImages = new Set();

for (const jsonPath of jsonFiles) {
  const id = path.basename(jsonPath, '.json');
  const fullPath = path.join(WORKSPACE, jsonPath);

  let raw;
  try {
    raw = fs.readFileSync(fullPath, 'utf8');
  } catch (err) {
    fail(`${jsonPath}: readable`, err.message);
    continue;
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    fail(`${jsonPath}: valid JSON`, err.message);
    continue;
  }

  const { errors } = validateEntry(parsed, id);
  if (errors.length > 0) {
    fail(`${jsonPath}: schema`, errors.join('; '));
  } else {
    pass(`${jsonPath}: schema`, 'OK');
  }

  const collisionCandidates = [`${id}.json`, `${id}.png`, `${id}.jpg`, `${id}.jpeg`, `${id}.webp`];
  if (collisionCandidates.some((name) => existingBasenames.has(name))) {
    fail(`${jsonPath}: id is unique`, `"${id}" already exists in submissions/ on the base branch`);
  } else {
    pass(`${jsonPath}: id is unique`, id);
  }

  const imageField = typeof parsed === 'object' && parsed ? parsed.image : undefined;
  if (typeof imageField === 'string') {
    const matchPath = imageFiles.find((f) => path.basename(f) === imageField);
    if (!matchPath) {
      fail(`${jsonPath}: matching image file present`, `No added file matches image field "${imageField}"`);
    } else {
      pass(`${jsonPath}: matching image file present`, matchPath);
      claimedImages.add(matchPath);

      const imgFull = path.join(WORKSPACE, matchPath);
      let stat;
      try {
        stat = fs.statSync(imgFull);
        if (stat.size > MAX_IMAGE_BYTES) {
          fail(`${matchPath}: size <= ${MAX_IMAGE_BYTES} bytes`, `${stat.size} bytes`);
        } else {
          pass(`${matchPath}: size <= ${MAX_IMAGE_BYTES} bytes`, `${stat.size} bytes`);
        }
      } catch (err) {
        fail(`${matchPath}: readable file`, err.message);
      }

      try {
        const dim = imageSize(fs.readFileSync(imgFull));
        if (dim.width > MAX_IMAGE_DIM || dim.height > MAX_IMAGE_DIM) {
          fail(`${matchPath}: dimensions <= ${MAX_IMAGE_DIM}x${MAX_IMAGE_DIM}`, `${dim.width}x${dim.height}`);
        } else {
          pass(`${matchPath}: dimensions <= ${MAX_IMAGE_DIM}x${MAX_IMAGE_DIM}`, `${dim.width}x${dim.height}`);
        }
      } catch (err) {
        fail(`${matchPath}: readable image`, err.message);
      }
    }
  }
}

const orphanImages = imageFiles.filter((f) => !claimedImages.has(f));
for (const orphan of orphanImages) {
  fail(`${orphan}: referenced by a submission JSON`, 'No added .json file has a matching "image" field');
}

fs.writeFileSync(path.join(WORKSPACE, 'validation-results.json'), JSON.stringify({ hasFailure, results }, null, 2));

for (const r of results) {
  console.log(`${r.ok ? 'PASS' : 'FAIL'} — ${r.check}: ${r.detail}`);
}

if (hasFailure) {
  console.error('\nValidation failed.');
  process.exitCode = 1;
} else {
  console.log('\nValidation passed.');
}
