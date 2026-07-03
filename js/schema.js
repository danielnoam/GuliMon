// Schema for submissions/<id>.json. Kept dependency-free (no DOM, no Node
// builtins) so it can be imported directly by the Cloudflare Pages Function
// (functions/api/submit.js) and by the CI validation scripts under
// .github/scripts/, in addition to the browser.

export const MAX_NAME_LEN = 40;
export const MAX_DESCRIPTION_LEN = 300;
export const MAX_UPLOADER_NAME_LEN = 40;
export const ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const IMAGE_PATTERN = /^(.+)\.(png|jpe?g|webp)$/i;

// Validates a parsed submission object. `expectedId`, when provided, is
// checked against entry.id (used to confirm id matches the filename).
// Returns { errors: string[] } — empty array means valid.
export function validateEntry(entry, expectedId) {
  const errors = [];

  if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
    return { errors: ['must be a JSON object'] };
  }

  const { id, name, description, uploaderName, image, createdAt } = entry;

  if (typeof id !== 'string' || id.length === 0) {
    errors.push('id: required string');
  } else if (!ID_PATTERN.test(id)) {
    errors.push('id: must be lowercase alphanumeric segments separated by hyphens');
  } else if (expectedId && id !== expectedId) {
    errors.push(`id: "${id}" must match filename "${expectedId}.json"`);
  }

  if (typeof name !== 'string' || name.length === 0) {
    errors.push('name: required string');
  } else if (name.length > MAX_NAME_LEN) {
    errors.push(`name: exceeds ${MAX_NAME_LEN} characters`);
  }

  if (description !== undefined && description !== null) {
    if (typeof description !== 'string') {
      errors.push('description: must be a string');
    } else if (description.length > MAX_DESCRIPTION_LEN) {
      errors.push(`description: exceeds ${MAX_DESCRIPTION_LEN} characters`);
    }
  }

  if (uploaderName !== undefined && uploaderName !== null) {
    if (typeof uploaderName !== 'string') {
      errors.push('uploaderName: must be a string');
    } else if (uploaderName.length > MAX_UPLOADER_NAME_LEN) {
      errors.push(`uploaderName: exceeds ${MAX_UPLOADER_NAME_LEN} characters`);
    }
  }

  if (typeof image !== 'string' || image.length === 0) {
    errors.push('image: required string');
  } else {
    const match = image.match(IMAGE_PATTERN);
    if (!match) {
      errors.push('image: must end in .png, .jpg, .jpeg, or .webp');
    } else if (typeof id === 'string' && match[1] !== id) {
      errors.push(`image: "${image}" must match id "${id}"`);
    }
  }

  if (typeof createdAt !== 'string' || Number.isNaN(Date.parse(createdAt))) {
    errors.push('createdAt: required valid ISO 8601 string');
  }

  return { errors };
}
