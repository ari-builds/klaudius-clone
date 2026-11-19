// Sites — bespoke websites Klaudius builds for each lead.
const db = require('./_db');

module.exports = async (req, res) => {
  if (db.cors(req, res)) return;
  const path = req.url.split('?')[0];
  const m = path.match(/^\/api\/sites\/([^/]+)$/);

  try { await db.ready(); } catch (e) {
    return db.json(res, 500, { error: 'Database unavailable' });
  }

  if (path === '/api/sites' && req.method === 'GET') {
    const rows = await db.query('select * from sites order by created_at desc');
    return db.json(res, 200, { ok: true, sites: rows });
  }

  if (path === '/api/sites' && req.method === 'POST') {
    const body = await db.parseBody(req);
    const id = db.newId('site_');
    const now = new Date().toISOString();
    await db.query(
      `insert into sites (id, user_id, lead_id, url, title, design_system, pages, status, published_at, created_at, updated_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [id, 'demo-user', body.lead_id, body.url, body.title || '', JSON.stringify(body.design_system || {}),
       JSON.stringify(body.pages || []), body.status || 'draft', body.status === 'published' ? now : null, now, now]
    );
    return db.json(res, 201, { ok: true, site: { id, url: body.url, status: body.status || 'draft' } });
  }

  if (m && req.method === 'PATCH') {
    const body = await db.parseBody(req);
    const now = new Date().toISOString();
    const fields = [];
    const params = [];
    let i = 1;
    for (const k of ['status','title','url','design_system','pages','published_at']) {
      if (k in body) { fields.push(`${k} = $${i++}`); params.push(typeof body[k] === 'object' ? JSON.stringify(body[k]) : body[k]); }
    }
    fields.push(`updated_at = $${i++}`); params.push(now);
    params.push(m[1]);
    await db.query(`update sites set ${fields.join(', ')} where id = $${i}`, params);
    return db.json(res, 200, { ok: true });
  }

  if (m && req.method === 'DELETE') {
    await db.query('delete from sites where id = $1', [m[1]]);
    return db.json(res, 200, { ok: true });
  }

  return db.json(res, 404, { error: 'not found' });
};
