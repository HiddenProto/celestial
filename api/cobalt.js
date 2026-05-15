import ytdl from '@distube/ytdl-core';

export default async function handler(req, res) {
  const id = req.query.id || (req.body && (req.body.id || req.body.videoId));
  if (!id) return res.status(400).json({ error: 'missing id' });

  try {
    const info = await ytdl.getInfo(`https://www.youtube.com/watch?v=${encodeURIComponent(id)}`, {
      requestOptions: {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        },
      },
    });
    const formats = ytdl.filterFormats(info.formats, 'audioonly');
    if (!formats.length) throw new Error('no audio formats found');
    formats.sort((a, b) => (b.audioBitrate || 0) - (a.audioBitrate || 0));
    return res.status(200).json({ url: formats[0].url });
  } catch (e) {
    return res.status(502).json({ error: e.message });
  }
}
