// Serve a built bespoke website by slug.
const db = require('./_db');

module.exports = async (req, res) => {
  if (db.cors(req, res)) return;
  let slug = null;
  try {
    const qIndex = req.url.indexOf('?');
    const query = qIndex >= 0 ? req.url.slice(qIndex + 1) : '';
    const params = new URLSearchParams(query);
    slug = params.get('slug');
  } catch {}
  if (!slug) return db.json(res, 400, { error: 'slug required' });

  try { await db.ready(); } catch (e) {
    return db.json(res, 500, { error: 'Database unavailable' });
  }

  try {
    const rows = await db.query('select * from sites where status = $1', ['published']);
    for (const row of rows) {
      try {
        let pages = row.pages;
        if (typeof pages === 'string') pages = JSON.parse(pages || '[]');
        if (!Array.isArray(pages)) pages = [];
        const page = pages.find((p) => p && p.slug === slug);
        if (page && page.html) {
          res.statusCode = 200;
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.setHeader('Cache-Control', 'public, max-age=3600');
          return res.end(page.html);
        }
      } catch {}
    }
  } catch (e) {
    return db.json(res, 500, { error: 'Lookup failed: ' + String(e.message || e) });
  }
  return db.json(res, 404, { error: 'site not found', slug });
};
