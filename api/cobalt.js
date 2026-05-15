// Uses Invidious public API to get a proxied audio stream URL for a YouTube video.
// Falls through multiple instances so one going down doesn't break playback.
const INSTANCES = [
  'https://inv.nadeko.net',
  'https://invidious.privacydev.net',
  'https://invidious.fdn.fr',
  'https://yewtu.be',
];

export default async function handler(req, res) {
  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'missing ?id=VIDEO_ID' });

  for (const host of INSTANCES) {
    try {
      const r = await fetch(
        `${host}/api/v1/videos/${encodeURIComponent(id)}?fields=adaptiveFormats`,
        {
          headers: { 'User-Agent': 'Mozilla/5.0' },
          signal: AbortSignal.timeout(8000),
        }
      );
      if (!r.ok) continue;

      const data = await r.json();
      const audios = (data.adaptiveFormats || []).filter(
        f => f.type && f.type.startsWith('audio/')
      );
      if (!audios.length) continue;

      // Pick highest bitrate
      audios.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
      const url = audios[0].proxyUrl || audios[0].url;
      if (url) return res.status(200).json({ url });
    } catch (_) {
      continue;
    }
  }

  res.status(502).json({ error: 'all invidious instances failed' });
}
