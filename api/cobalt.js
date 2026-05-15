import { Innertube } from 'youtubei.js';

// Try each client type in order — ANDROID/IOS use InnerTube and bypass web bot-detection.
const CLIENTS = ['ANDROID', 'IOS', 'TV'];

export default async function handler(req, res) {
  const id = req.query.id || (req.body && (req.body.id || req.body.videoId));
  if (!id) return res.status(400).json({ error: 'missing id' });

  let yt;
  try {
    yt = await Innertube.create({ cache: null, generate_session_locally: true });
  } catch (e) {
    return res.status(502).json({ error: 'innertube init failed: ' + e.message });
  }

  for (const client of CLIENTS) {
    try {
      const info = await yt.getBasicInfo(id, client);
      const format = info.chooseFormat({ type: 'audio', quality: 'best' });
      if (!format) continue;
      const url = format.url ?? format.decipher(yt.session.player);
      if (url) return res.status(200).json({ url });
    } catch (_) {
      // try next client
    }
  }

  res.status(502).json({ error: 'all clients failed' });
}
