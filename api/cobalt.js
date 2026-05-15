import { Innertube } from 'youtubei.js';

// Public Invidious instances — tried in order, first working URL wins.
// These expose direct googlevideo CDN URLs which the browser can play natively.
const INVIDIOUS = [
  'https://inv.nadeko.net',
  'https://iv.ggtyler.dev',
  'https://invidious.nerdvpn.de',
  'https://yt.cdaut.de',
  'https://invidious.privacydev.net',
];

async function fromInvidious(id) {
  for (const host of INVIDIOUS) {
    try {
      const res = await Promise.race([
        fetch(`${host}/api/v1/videos/${id}?fields=adaptiveFormats`),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 5000)),
      ]);
      if (!res.ok) continue;
      const data = await res.json();
      const audio = (data.adaptiveFormats || [])
        .filter(f => f.type && f.type.startsWith('audio/'));
      if (!audio.length) continue;
      audio.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
      const url = audio[0].url;
      if (url) return url;
    } catch (_) {}
  }
  return null;
}

const YT_CLIENTS = ['ANDROID', 'IOS', 'TV', 'WEB'];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const id = req.query.id || (req.body && (req.body.id || req.body.videoId));
  if (!id) return res.status(400).json({ error: 'missing id' });

  // Invidious is more reliable from datacenter IPs than raw Innertube
  try {
    const url = await fromInvidious(id);
    if (url) return res.status(200).json({ url, src: 'invidious' });
  } catch (_) {}

  // Fallback: youtubei.js direct Innertube
  let yt;
  try {
    yt = await Innertube.create({ cache: null });
  } catch (e) {
    return res.status(502).json({ error: 'innertube init failed: ' + e.message });
  }

  const errors = [];
  for (const client of YT_CLIENTS) {
    try {
      const info = await Promise.race([
        yt.getBasicInfo(id, client),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 6000)),
      ]);
      const format = info.chooseFormat({ type: 'audio', quality: 'best' });
      if (!format) { errors.push(client + ': no format'); continue; }
      let url = format.url;
      if (!url && yt.session.player) url = format.decipher(yt.session.player);
      if (url) return res.status(200).json({ url, src: client });
      errors.push(client + ': url null');
    } catch (e) {
      errors.push(client + ': ' + e.message);
    }
  }

  res.status(502).json({ error: 'all sources failed', details: errors });
}
