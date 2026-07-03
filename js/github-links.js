// Pure functions for building GitHub deep links. No DOM, no fetch — safe to
// import from a browser <script type="module"> or from Node for unit tests.

export const MAX_CREATE_FILE_URL_LENGTH = 8000;

export function slugify(name) {
  const slug = String(name ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(new RegExp('[\\u0300-\\u036f]', 'g'), '') // strip accents (post-NFKD combining marks)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
  return slug || 'gilguli';
}

export function randomBase36(length = 4) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  for (let i = 0; i < length; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

// `suffix` is injectable so tests can generate deterministic ids.
export function generateId(name, suffix = randomBase36(4)) {
  return `${slugify(name)}-${suffix}`;
}

export function buildForkUrl(owner, repo) {
  return `https://github.com/${owner}/${repo}/fork`;
}

export function buildUploadUrl(visitorUsername, repo, branch = 'main') {
  return `https://github.com/${encodeURIComponent(visitorUsername)}/${repo}/upload/${branch}/submissions`;
}

// Builds the "create new file" deep link with the JSON pre-filled via the
// `value` query param. GitHub's /new/ endpoint only pre-fills text content —
// this is why images can't go through a URL and must be uploaded separately.
export function buildCreateFileUrl(visitorUsername, repo, branch, id, entry) {
  const json = JSON.stringify(entry, null, 2);
  const filename = `submissions/${id}.json`;
  const url =
    `https://github.com/${encodeURIComponent(visitorUsername)}/${repo}/new/${branch}/submissions` +
    `?filename=${encodeURIComponent(filename)}&value=${encodeURIComponent(json)}`;
  return url;
}

// Wraps buildCreateFileUrl and truncates `description` if the resulting URL
// would exceed a safe length. Returns { url, entry, truncated } so callers
// can warn the user when truncation happened.
export function buildCreateFileUrlWithTruncation(
  visitorUsername,
  repo,
  branch,
  id,
  entry,
  maxLength = MAX_CREATE_FILE_URL_LENGTH
) {
  let current = { ...entry };
  let url = buildCreateFileUrl(visitorUsername, repo, branch, id, current);
  let truncated = false;

  while (url.length > maxLength && current.description && current.description.length > 0) {
    truncated = true;
    const nextLength = Math.max(0, current.description.length - 40);
    current = { ...current, description: current.description.slice(0, nextLength) };
    url = buildCreateFileUrl(visitorUsername, repo, branch, id, current);
  }

  return { url, entry: current, truncated };
}

export function buildCompareUrl(owner, repo, visitorUsername, branch = 'main') {
  return `https://github.com/${owner}/${repo}/compare/${branch}...${encodeURIComponent(visitorUsername)}:${repo}:${branch}?expand=1`;
}
