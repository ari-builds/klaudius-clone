// Website builder — generates honest, detail-driven one-page PREVIEWS for leads.
// Uses lib/site.js so freebuild and builder produce identical output.
// A preview is private until a human explicitly approves publishing in /api/sites.
const db = require('./_db');

module.exports = async (req, res) => {
  if (db.cors(req, res)) return;
  const path = req.url.split('?')[0];
  const m = path.match(/^\/api\/builder\/([^/]+)$/);

  try { await db.ready(); } catch (e) {
    return db.json(res, 500, { error: 'Database unavailable' });
  }

  if (path === '/api/builder' && req.method === 'POST') {
    let body;
    try { body = await db.parseBody(req); } catch { return db.json(res, 400, { error: 'Invalid request body' }); }
    const leadId = body.lead_id;
    if (!leadId) return db.json(res, 400, { error: 'lead_id required' });

    const leadRows = await db.query('select * from leads where id = $1', [leadId]);
    if (!leadRows.length) return db.json(res, 404, { error: 'lead not found' });
    const lead = leadRows[0];
    if (lead.intake_status === 'sample') return db.json(res, 400, { error: 'Sample leads cannot be built into real previews' });
    if (lead.intake_status !== 'verified') return db.json(res, 403, { error: 'Verify this lead before building a site' });

    // The design is resolved from the details actually stored on the lead.
    // Caller overrides are optional; no contact details are ever invented.
    const details = db.parseJson(lead.details, {});
    const design = String(body.design || details.design || '').trim();
    const site = await db.createPreviewSite(lead, { req, design });
    const previewUrl = `/api/site?slug=${encodeURIComponent(site.slug)}&token=${encodeURIComponent(site.token)}`;

    return db.json(res, 201, {
      ok: true,
      site: { id: site.id, url: site.url, slug: site.slug, status: 'preview', design: site.design, previewUrl },
      note: 'Private preview generated from supplied details. Not published; nothing was sent.',
    });
  }

  if (m && req.method === 'GET') {
    const rows = await db.query('select * from sites where id = $1', [m[1]]);
    if (!rows.length) return db.json(res, 404, { error: 'site not found' });
    const site = rows[0];
    const pages = db.parseJson(site.pages, []);
    const slug = pages[0] && pages[0].slug;
    const previewUrl = slug ? `/api/site?slug=${encodeURIComponent(slug)}&token=${encodeURIComponent(site.preview_token || '')}` : '';
    return db.json(res, 200, { ok: true, site: { ...site, previewUrl } });
  }

  return db.json(res, 404, { error: 'not found' });
};
