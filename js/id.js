// Submission id generation. Pure, dependency-free — used server-side by
// functions/api/submit.js (the authority on ids) via a relative import.

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
