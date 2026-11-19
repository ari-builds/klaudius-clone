// Targets — regions/niches Klaudius scans for businesses without websites.
const db = require('./_db');

module.exports = async (req, res) => {
  if (db.cors(req, res)) return;
  const path = req.url.split('?')[0];
  const m = path.match(/^\/api\/targets\/([^/]+)$/);

  try { await db.ready(); } catch (e) {
    return db.json(res, 500, { error: 'Database unavailable' });
  }

  if (path === '/api/targets' && req.method === 'GET') {
    const rows = await db.query('select * from targets order by created_at desc');
    return db.json(res, 200, { ok: true, targets: rows });
  }

  if (path === '/api/targets' && req.method === 'POST') {
    const body = await db.parseBody(req);
    const id = db.newId('target_');
    const now = new Date().toISOString();
    await db.query(
      'insert into targets (id, user_id, region, niche, status, businesses_found, created_at, updated_at) values ($1,$2,$3,$4,$5,$6,$7,$8)',
      [id, 'demo-user', body.region, body.niche || '', 'active', 0, now, now]
    );
    return db.json(res, 201, { ok: true, target: { id, region: body.region, niche: body.niche || '', status: 'active', businesses_found: 0 } });
  }

  if (m && req.method === 'PATCH') {
    const body = await db.parseBody(req);
    const now = new Date().toISOString();
    await db.query('update targets set niche = coalesce($1, niche), updated_at = $2 where id = $3', [body.niche, now, m[1]]);
    return db.json(res, 200, { ok: true });
  }

  if (m && req.method === 'DELETE') {
    await db.query('delete from targets where id = $1', [m[1]]);
    return db.json(res, 200, { ok: true });
  }

  return db.json(res, 404, { error: 'not found' });
};
