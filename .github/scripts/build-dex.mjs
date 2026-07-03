// Runs in build-dex.yml (push to main). Rebuilds data/dex.json from
// submissions/*.json. Re-validates as defense in depth: entries that fail
// are skipped (logged as warnings) rather than failing the whole site build,
// since they already passed validate-submission.yml once at merge time.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateEntry } from '../../js/schema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE = process.env.GITHUB_WORKSPACE || path.resolve(__dirname, '..', '..');
const SUBMISSIONS_DIR = path.join(WORKSPACE, 'submissions');
const OUT_PATH = path.join(WORKSPACE, 'data', 'dex.json');

const files = fs.existsSync(SUBMISSIONS_DIR)
  ? fs.readdirSync(SUBMISSIONS_DIR).filter((f) => f.endsWith('.json'))
  : [];

const entries = [];
const skipped = [];

for (const file of files) {
  const id = path.basename(file, '.json');
  const fullPath = path.join(SUBMISSIONS_DIR, file);

  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
  } catch (err) {
    skipped.push(`${file}: invalid JSON (${err.message})`);
    continue;
  }

  const { errors } = validateEntry(parsed, id);
  if (errors.length > 0) {
    skipped.push(`${file}: ${errors.join('; ')}`);
    continue;
  }

  entries.push(parsed);
}

entries.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

const dex = {
  generatedAt: new Date().toISOString(),
  entries,
};

fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
fs.writeFileSync(OUT_PATH, `${JSON.stringify(dex, null, 2)}\n`);

if (skipped.length > 0) {
  console.warn('Skipped invalid submission files (should not normally happen post-merge):');
  for (const s of skipped) console.warn(`  - ${s}`);
}
console.log(`Built data/dex.json with ${entries.length} entr${entries.length === 1 ? 'y' : 'ies'}.`);
