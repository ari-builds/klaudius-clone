// Website builder — generates honest, detail-driven one-page sites for leads.
// Uses lib/site.js so freebuild and builder produce identical output.
const db = require('./_db');
const { buildSiteHtml, SYSTEMS } = require('../lib/site');

module.exports = async (req, res) => {
  if (db.cors(req, res)) return;
  const path = req.url.split('?')[0];
  const m = path.match(/^\/api\/builder\/([^/]+)$/);

  try { await db.ready(); } catch (e) {
    return db.json(res, 500, { error: 'Database unavailable' });
  }

  if (path === '/api/builder' && req.method === 'POST') {
    const body = await db.parseBody(req);
    const leadId = body.lead_id;
    if (!leadId) return db.json(res, 400, { error: 'lead_id required' });

    const leadRows = await db.query('select * from leads where id = $1', [leadId]);
    if (!leadRows.length) return db.json(res, 404, { error: 'lead not found' });
    const lead = leadRows[0];

    // Callers may override presentation, but never invent contact details.
    const html = buildSiteHtml(lead, { design: body.design || (db.parseJson(lead.details, {}) || {}).design });
    const id = db.newId('site_');
    const now = new Date().toISOString();
    const slug = `${String(lead.name || 'business').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'business'}-${id.slice(-6)}`;
    const url = `https://klaudius-clone.vercel.app/site/${slug}`;

    await db.query(
      `insert into sites (id, user_id, lead_id, url, title, design_system, pages, status, published_at, created_at, updated_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [id, 'demo-user', leadId, url, `${lead.name} — Website`, JSON.stringify(SYSTEMS[(body.design)] || {}), JSON.stringify([{ slug, html }]), 'published', now, now, now]
    );
    await db.query('update leads set status = $1 where id = $2', ['site-built', leadId]);

    return db.json(res, 201, { ok: true, site: { id, url, slug, status: 'published' }, html });
  }

  if (m && req.method === 'GET') {
    const rows = await db.query('select * from sites where id = $1', [m[1]]);
    if (!rows.length) return db.json(res, 404, { error: 'site not found' });
    return db.json(res, 200, { ok: true, site: rows[0] });
  }

  return db.json(res, 404, { error: 'not found' });
};
