// Tries Invidious instances in parallel (race), then falls back to Piped.
// Promise.any() returns the first success, ignoring slower/failing instances.
const INVIDIOUS = [
  'https://inv.nadeko.net',
  'https://invidious.flokinet.to',
  'https://inv.tux.pizza',
  'https://invidious.no-logs.com',
  'https://invidious.nerdvpn.de',
];

const PIPED = [
  'https://pipedapi.kavin.rocks',
  'https://api.piped.yt',
  'https://pipedapi.adminforge.de',
];

async function race(instances, fn) {
  try { return await Promise.any(instances.map(fn)); }
  catch (_) { return null; }
}

export default async function handler(req, res) {
  const id = req.query.id || (req.body && (req.body.id || req.body.videoId));
  if (!id) return res.status(400).json({ error: 'missing id' });

  // Race all Invidious instances — fastest win, 4s hard cap
  let url = await race(INVIDIOUS, async host => {
    const r = await fetch(
      `${host}/api/v1/videos/${encodeURIComponent(id)}?fields=adaptiveFormats`,
      { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(4000) }
    );
    if (!r.ok) throw new Error(r.status);
    const { adaptiveFormats = [] } = await r.json();
    const audios = adaptiveFormats.filter(f => f.type && f.type.startsWith('audio/'));
    if (!audios.length) throw new Error('no audio');
    audios.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
    const u = audios[0].proxyUrl || audios[0].url;
    if (!u) throw new Error('no url');
    return u;
  });

  // Piped fallback — race all instances, 4s hard cap
  if (!url) {
    url = await race(PIPED, async host => {
      const r = await fetch(
        `${host}/streams/${encodeURIComponent(id)}`,
        { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(4000) }
      );
      if (!r.ok) throw new Error(r.status);
      const { audioStreams = [] } = await r.json();
      const audios = audioStreams.filter(s => !s.videoOnly);
      if (!audios.length) throw new Error('no audio');
      audios.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
      const u = audios[0].url;
      if (!u) throw new Error('no url');
      return u;
    });
  }

  if (url) return res.status(200).json({ url });
  res.status(502).json({ error: 'all sources failed' });
}
