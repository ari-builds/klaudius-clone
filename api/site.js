// Serve a built one-page site by slug.
// Public requests only see sites with status='published'. A private preview is
// served ONLY when its unguessable token is supplied — never by default.
const db = require('./_db');

module.exports = async (req, res) => {
  if (db.cors(req, res)) return;
  let slug = null;
  let token = null;
  try {
    const qIndex = req.url.indexOf('?');
    const query = qIndex >= 0 ? req.url.slice(qIndex + 1) : '';
    const params = new URLSearchParams(query);
    slug = params.get('slug');
    token = params.get('token');
  } catch {}
  if (!slug) return db.json(res, 400, { error: 'slug required' });

  try { await db.ready(); } catch (e) {
    return db.json(res, 500, { error: 'Database unavailable' });
  }

  try {
    let rows = [];
    let isPreview = false;
    if (token) {
      rows = await db.query("select * from sites where preview_token = $1 and preview_token <> ''", [String(token).slice(0, 100)]);
      isPreview = rows.length > 0;
    }
    if (!rows.length) rows = await db.query("select * from sites where status = 'published'");

    for (const row of rows) {
      const pages = db.parseJson(row.pages, []);
      if (!Array.isArray(pages)) continue;
      const page = pages.find((p) => p && p.slug === slug);
      if (page && page.html) {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('X-Robots-Tag', 'noindex, nofollow');
        res.setHeader('Cache-Control', isPreview ? 'no-store' : 'public, max-age=3600');
        if (isPreview) res.setHeader('Referrer-Policy', 'no-referrer');
        return res.end(page.html);
      }
    }
  } catch (e) {
    return db.json(res, 500, { error: 'Lookup failed' });
  }
  return db.json(res, 404, { error: 'site not found', slug });
};
