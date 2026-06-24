export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'url requerida' });

  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Atalaya/1.0)' },
      signal: AbortSignal.timeout(5000),
    });
    const html = await r.text();
    const ogTitle   = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
    const tagTitle  = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const raw = (ogTitle?.[1] || tagTitle?.[1] || url).trim();
    const title = raw.replace(/\s+/g, ' ').substring(0, 120);
    return res.json({ title, url });
  } catch {
    return res.json({ title: url, url });
  }
}
