import { Innertube } from 'youtubei.js';

const CLIENTS = ['ANDROID', 'IOS', 'TV', 'WEB'];

export default async function handler(req, res) {
  const id = req.query.id || (req.body && (req.body.id || req.body.videoId));
  if (!id) return res.status(400).json({ error: 'missing id' });

  let yt;
  try {
    yt = await Innertube.create({ cache: null });
  } catch (e) {
    return res.status(502).json({ error: 'innertube init failed: ' + e.message });
  }

  const errors = [];
  for (const client of CLIENTS) {
    try {
      const info = await Promise.race([
        yt.getBasicInfo(id, client),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 6000)),
      ]);
      const format = info.chooseFormat({ type: 'audio', quality: 'best' });
      if (!format) { errors.push(client + ': no format'); continue; }
      let url = format.url;
      if (!url && yt.session.player) url = format.decipher(yt.session.player);
      if (url) return res.status(200).json({ url });
      errors.push(client + ': url null');
    } catch (e) {
      errors.push(client + ': ' + e.message);
    }
  }

  res.status(502).json({ error: 'all clients failed', details: errors });
}
