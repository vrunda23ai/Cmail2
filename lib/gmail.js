// Gmail REST helpers using an access token issued for the user via Google OAuth.
// We rely on the provider_token that Supabase returns from Google login
// (scopes include gmail.readonly). No separate Gmail-only OAuth dance is needed
// for the primary flow.

export function decodeBase64Url(s) {
  if (!s) return '';
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  try { return Buffer.from(b64, 'base64').toString('utf-8'); } catch { return ''; }
}

export function extractPlainText(payload) {
  if (!payload) return '';
  if (payload.mimeType === 'text/plain' && payload.body?.data) return decodeBase64Url(payload.body.data);
  if (Array.isArray(payload.parts)) {
    for (const p of payload.parts) {
      const t = extractPlainText(p);
      if (t) return t;
    }
  }
  if (payload.body?.data) return decodeBase64Url(payload.body.data);
  return '';
}

export function headerVal(headers, name) {
  const h = (headers || []).find((x) => x.name?.toLowerCase() === name.toLowerCase());
  return h?.value || '';
}

export function parseFrom(from) {
  const m = String(from || '').match(/^\s*"?([^"<]*)"?\s*<([^>]+)>\s*$/);
  if (m) return { name: m[1].trim(), email: m[2].trim() };
  return { name: '', email: String(from || '').trim() };
}

export async function gmailFetch(path, accessToken) {
  const res = await fetch(`https://gmail.googleapis.com${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Gmail ${path} failed: ${res.status} ${await res.text()}`);
  return res.json();
}
