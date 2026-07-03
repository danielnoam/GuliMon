// Cloudflare Pages Function — POST /api/submit
//
// Holds the one server-side secret in this whole project (env.GITHUB_TOKEN,
// a fine-grained PAT scoped to just this repo with Contents: write and
// Pull requests: write). Everything else in GuliMon is static and public.
//
// On a valid submission this creates a branch, commits both the image and
// the metadata JSON to it, and opens a PR — the exact same end state a
// visitor used to produce by hand via fork/upload/PR. validate-submission.yml
// and automerge-submission.yml are unchanged and still gate whether it
// actually goes live; this function only automates getting the PR opened.
import { validateEntry, MAX_NAME_LEN, MAX_DESCRIPTION_LEN, MAX_UPLOADER_NAME_LEN } from '../../js/schema.js';
import { generateId } from '../../js/id.js';

const OWNER = 'danielnoam';
const REPO = 'GuliMon';
const BASE_BRANCH = 'main';
const MAX_IMAGE_BYTES = 1024 * 1024; // 1MB — matches validate-submission.yml
const MAX_IMAGE_DIM = 1024; // matches validate-submission.yml

export async function onRequestPost({ request, env }) {
  if (!env.GITHUB_TOKEN) {
    return json({ ok: false, error: 'Server is misconfigured (missing GITHUB_TOKEN).' }, 500);
  }

  let form;
  try {
    form = await request.formData();
  } catch {
    return json({ ok: false, error: 'Expected multipart/form-data.' }, 400);
  }

  const name = String(form.get('name') ?? '').trim();
  const description = String(form.get('description') ?? '').trim();
  const uploaderName = String(form.get('uploaderName') ?? '').trim();
  const imageFile = form.get('image');

  const problems = [];
  if (!name) problems.push('name is required.');
  if (name.length > MAX_NAME_LEN) problems.push(`name exceeds ${MAX_NAME_LEN} characters.`);
  if (description.length > MAX_DESCRIPTION_LEN) problems.push(`description exceeds ${MAX_DESCRIPTION_LEN} characters.`);
  if (uploaderName.length > MAX_UPLOADER_NAME_LEN) problems.push(`uploaderName exceeds ${MAX_UPLOADER_NAME_LEN} characters.`);
  if (!(imageFile instanceof File) || imageFile.size === 0) problems.push('image file is required.');

  if (problems.length > 0) {
    return json({ ok: false, error: problems.join(' ') }, 400);
  }

  const imageBytes = new Uint8Array(await imageFile.arrayBuffer());

  if (imageBytes.byteLength > MAX_IMAGE_BYTES) {
    return json({ ok: false, error: `Image exceeds ${MAX_IMAGE_BYTES} bytes.` }, 400);
  }

  const dimensions = readPngDimensions(imageBytes);
  if (!dimensions) {
    return json({ ok: false, error: 'Image must be a valid PNG.' }, 400);
  }
  if (dimensions.width > MAX_IMAGE_DIM || dimensions.height > MAX_IMAGE_DIM) {
    return json({ ok: false, error: `Image dimensions exceed ${MAX_IMAGE_DIM}x${MAX_IMAGE_DIM}.` }, 400);
  }

  const id = generateId(name);
  const entry = {
    id,
    name,
    ...(description ? { description } : {}),
    ...(uploaderName ? { uploaderName } : {}),
    image: `${id}.png`,
    createdAt: new Date().toISOString(),
  };

  const { errors } = validateEntry(entry, id);
  if (errors.length > 0) {
    return json({ ok: false, error: `Internal validation error: ${errors.join('; ')}` }, 500);
  }

  const gh = ghClient(env.GITHUB_TOKEN);
  const branch = `submit-${id}`;
  const jsonBytes = new TextEncoder().encode(JSON.stringify(entry, null, 2));

  try {
    const baseRef = await gh(`/repos/${OWNER}/${REPO}/git/ref/heads/${BASE_BRANCH}`);
    const baseSha = baseRef.object.sha;

    await gh(`/repos/${OWNER}/${REPO}/git/refs`, {
      method: 'POST',
      body: { ref: `refs/heads/${branch}`, sha: baseSha },
    });

    try {
      await gh(`/repos/${OWNER}/${REPO}/contents/submissions/${id}.png`, {
        method: 'PUT',
        body: { message: `Add ${id}.png`, content: bytesToBase64(imageBytes), branch },
      });

      await gh(`/repos/${OWNER}/${REPO}/contents/submissions/${id}.json`, {
        method: 'PUT',
        body: { message: `Add ${id}.json`, content: bytesToBase64(jsonBytes), branch },
      });

      const pr = await gh(`/repos/${OWNER}/${REPO}/pulls`, {
        method: 'POST',
        body: {
          title: `Add Gilguli: ${name}`,
          head: branch,
          base: BASE_BRANCH,
          body: 'Opened automatically via the GuliMon submission form. Auto-merges if validate-submission checks pass.',
        },
      });

      return json({ ok: true, id, entry, prUrl: pr.html_url });
    } catch (err) {
      // Best-effort cleanup so a mid-flight failure doesn't leave a stray branch.
      await gh(`/repos/${OWNER}/${REPO}/git/refs/heads/${branch}`, { method: 'DELETE' }).catch(() => {});
      throw err;
    }
  } catch (err) {
    return json({ ok: false, error: `Could not open the submission PR: ${err.message}` }, 502);
  }
}

function ghClient(token) {
  return async (path, { method = 'GET', body } = {}) => {
    const res = await fetch(`https://api.github.com${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'GuliMon-Submit-Function',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      let detail = res.statusText;
      try {
        const data = await res.json();
        detail = data.message || detail;
      } catch {
        // response wasn't JSON — fall back to statusText
      }
      throw new Error(`GitHub API ${method} ${path} failed (${res.status}): ${detail}`);
    }

    return res.status === 204 ? null : res.json();
  };
}

export function bytesToBase64(bytes) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

export function readPngDimensions(bytes) {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.byteLength < 24) return null;
  for (let i = 0; i < signature.length; i++) {
    if (bytes[i] !== signature[i]) return null;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16, false), height: view.getUint32(20, false) };
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
