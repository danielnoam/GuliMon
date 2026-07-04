// Shared helpers for functions/api/submit.js and functions/api/edit.js.
// Lives under _shared/ (underscore prefix) so Cloudflare Pages doesn't treat
// it as a route of its own.

export function ghClient(token) {
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
      const err = new Error(`GitHub API ${method} ${path} failed (${res.status}): ${detail}`);
      err.status = res.status;
      throw err;
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

export function base64ToBytes(base64) {
  const binary = atob(base64.replace(/\n/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
