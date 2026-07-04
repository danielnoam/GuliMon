// Cloudflare Pages Function — POST /api/edit
//
// Updates or removes any existing Gilguli — deliberately open to any
// visitor, no ownership check. Same accepted-tradeoff posture as
// /api/submit having no login/CAPTCHA gate, just extended to existing
// content too: anyone can edit or delete anyone's entry.
//
// Unlike /api/submit, this commits straight to `main` instead of opening a
// PR. That's because validate-submission.yml's actual security boundary is
// "a PR may only ADD files" — letting edit/delete PRs through that pipeline
// would need relaxing that invariant, which is a bigger, separate change
// from "open editing." Committing directly keeps that invariant intact for
// the create flow while still allowing open edits/deletes here.
import {
  validateEntry,
  MAX_NAME_LEN,
  MAX_DESCRIPTION_LEN,
  MAX_UPLOADER_NAME_LEN,
} from '../../js/schema.js';
import { readPngDimensions } from '../../js/png-dimensions.js';
import { ghClient, bytesToBase64, base64ToBytes, json } from '../_shared/github.js';

const OWNER = 'danielnoam';
const REPO = 'GuliMon';
const BASE_BRANCH = 'main';
const MAX_IMAGE_BYTES = 1024 * 1024;
const MAX_IMAGE_DIM = 1024;

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

  const id = String(form.get('id') ?? '').trim();
  const action = String(form.get('action') ?? '').trim();

  if (!id) return json({ ok: false, error: 'id is required.' }, 400);
  if (action !== 'update' && action !== 'delete') {
    return json({ ok: false, error: 'action must be "update" or "delete".' }, 400);
  }

  const gh = ghClient(env.GITHUB_TOKEN);
  const jsonPath = `submissions/${id}.json`;
  const imagePath = `submissions/${id}.png`;

  let current;
  try {
    current = await gh(`/repos/${OWNER}/${REPO}/contents/${jsonPath}?ref=${BASE_BRANCH}`);
  } catch (err) {
    if (err.status === 404) {
      return json({ ok: false, error: 'No submission with that id was found.' }, 404);
    }
    return json({ ok: false, error: `Could not read the existing submission: ${err.message}` }, 502);
  }

  let existingEntry;
  try {
    existingEntry = JSON.parse(new TextDecoder().decode(base64ToBytes(current.content)));
  } catch (err) {
    return json({ ok: false, error: `Existing submission is corrupt: ${err.message}` }, 500);
  }

  if (action === 'delete') {
    try {
      await gh(`/repos/${OWNER}/${REPO}/contents/${jsonPath}`, {
        method: 'DELETE',
        body: { message: `Remove ${id}.json`, sha: current.sha, branch: BASE_BRANCH },
      });

      // Best-effort: if the image lookup fails for any reason we still
      // leave the JSON removed rather than blocking on cleanup of the image.
      const imageMeta = await gh(`/repos/${OWNER}/${REPO}/contents/${imagePath}?ref=${BASE_BRANCH}`).catch(() => null);
      if (imageMeta) {
        await gh(`/repos/${OWNER}/${REPO}/contents/${imagePath}`, {
          method: 'DELETE',
          body: { message: `Remove ${id}.png`, sha: imageMeta.sha, branch: BASE_BRANCH },
        }).catch(() => {});
      }

      return json({ ok: true, removed: true, id });
    } catch (err) {
      return json({ ok: false, error: `Could not delete: ${err.message}` }, 502);
    }
  }

  // action === 'update'
  const name = String(form.get('name') ?? existingEntry.name ?? '').trim();
  const description = String(form.get('description') ?? existingEntry.description ?? '').trim();
  const uploaderName = String(form.get('uploaderName') ?? existingEntry.uploaderName ?? '').trim();
  const imageFile = form.get('image');

  const problems = [];
  if (!name) problems.push('name is required.');
  if (name.length > MAX_NAME_LEN) problems.push(`name exceeds ${MAX_NAME_LEN} characters.`);
  if (description.length > MAX_DESCRIPTION_LEN) problems.push(`description exceeds ${MAX_DESCRIPTION_LEN} characters.`);
  if (uploaderName.length > MAX_UPLOADER_NAME_LEN) problems.push(`uploaderName exceeds ${MAX_UPLOADER_NAME_LEN} characters.`);
  if (problems.length > 0) {
    return json({ ok: false, error: problems.join(' ') }, 400);
  }

  let newImageBytes = null;
  if (imageFile instanceof File && imageFile.size > 0) {
    newImageBytes = new Uint8Array(await imageFile.arrayBuffer());
    if (newImageBytes.byteLength > MAX_IMAGE_BYTES) {
      return json({ ok: false, error: `Image exceeds ${MAX_IMAGE_BYTES} bytes.` }, 400);
    }
    const dim = readPngDimensions(newImageBytes);
    if (!dim) {
      return json({ ok: false, error: 'Image must be a valid PNG.' }, 400);
    }
    if (dim.width > MAX_IMAGE_DIM || dim.height > MAX_IMAGE_DIM) {
      return json({ ok: false, error: `Image dimensions exceed ${MAX_IMAGE_DIM}x${MAX_IMAGE_DIM}.` }, 400);
    }
  }

  const updatedEntry = {
    ...existingEntry,
    name,
    ...(description ? { description } : {}),
    ...(uploaderName ? { uploaderName } : {}),
    updatedAt: new Date().toISOString(),
  };
  if (!description) delete updatedEntry.description;
  if (!uploaderName) delete updatedEntry.uploaderName;

  const { errors } = validateEntry(updatedEntry, id);
  if (errors.length > 0) {
    return json({ ok: false, error: `Internal validation error: ${errors.join('; ')}` }, 500);
  }

  try {
    if (newImageBytes) {
      const imageMeta = await gh(`/repos/${OWNER}/${REPO}/contents/${imagePath}?ref=${BASE_BRANCH}`);
      await gh(`/repos/${OWNER}/${REPO}/contents/${imagePath}`, {
        method: 'PUT',
        body: {
          message: `Update ${id}.png`,
          content: bytesToBase64(newImageBytes),
          sha: imageMeta.sha,
          branch: BASE_BRANCH,
        },
      });
    }

    const updatedJsonBytes = new TextEncoder().encode(JSON.stringify(updatedEntry, null, 2));
    await gh(`/repos/${OWNER}/${REPO}/contents/${jsonPath}`, {
      method: 'PUT',
      body: {
        message: `Update ${id}.json`,
        content: bytesToBase64(updatedJsonBytes),
        sha: current.sha,
        branch: BASE_BRANCH,
      },
    });

    return json({ ok: true, entry: updatedEntry });
  } catch (err) {
    return json({ ok: false, error: `Could not save changes: ${err.message}` }, 502);
  }
}
