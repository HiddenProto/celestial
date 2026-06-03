// Same-origin passthrough for the AI chat backend.
//
// The AI page used to fetch the backend directly. On filtered networks (school)
// that direct request is blocked and comes back 401, because the backend host is
// a known unblocker domain. By fetching /api/chat (THIS domain) instead, the
// browser only ever talks to our own origin — which the user already reaches —
// and we forward to the real backend server-side from Vercel, off the school
// network. The response is a single JSON object (no streaming), so a plain
// text relay is sufficient.

const UPSTREAM = 'https://celestial.press/api/chat';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  try {
    const body = typeof req.body === 'string'
      ? req.body
      : JSON.stringify(req.body || {});

    const upstream = await Promise.race([
      fetch(UPSTREAM, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      }),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 30000)),
    ]);

    const text = await upstream.text();
    res.status(upstream.status);
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json');
    return res.send(text);
  } catch (e) {
    return res.status(502).json({ error: 'AI backend unavailable', detail: String((e && e.message) || e) });
  }
}
