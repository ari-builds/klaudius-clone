// CRM leads — businesses Klaudius has found, scored, and contacted.
const db = require('./_db');

module.exports = async (req, res) => {
  if (db.cors(req, res)) return;
  const path = req.url.split('?')[0];
  const m = path.match(/^\/api\/leads\/([^/]+)$/);

  try { await db.ready(); } catch (e) {
    return db.json(res, 500, { error: 'Database unavailable' });
  }

  if (path === '/api/leads' && req.method === 'GET') {
    const status = req.url.split('?')[0].includes('?') ? new URL(req.url, 'http://x').searchParams.get('status') : null;
    let rows;
    if (status) rows = await db.query('select * from leads where status = $1 order by score desc, created_at desc', [status]);
    else rows = await db.query('select * from leads order by score desc, created_at desc');
    return db.json(res, 200, { ok: true, leads: rows });
  }

  if (path === '/api/leads' && req.method === 'POST') {
    const body = await db.parseBody(req);
    const id = db.newId('lead_');
    const now = new Date().toISOString();
    await db.query(
      `insert into leads (id, user_id, target_id, name, website, phone, email, address, niche, has_website, status, score, photos, details, last_contacted_at, created_at, updated_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
      [id, 'demo-user', body.target_id || '', body.name, body.website || '', body.phone || '', body.email || '', body.address || '', body.niche || '',
       body.has_website ? 1 : 0, body.status || 'new', body.score || 0, JSON.stringify(body.photos || []), JSON.stringify(body.details || {}), null, now, now]
    );
    return db.json(res, 201, { ok: true, lead: { id, name: body.name, status: body.status || 'new', score: body.score || 0 } });
  }

  if (m && req.method === 'PATCH') {
    const body = await db.parseBody(req);
    const now = new Date().toISOString();
    const fields = [];
    const params = [];
    let i = 1;
    for (const k of ['status','score','name','phone','email','address','niche','has_website','last_contacted_at','details','photos']) {
      if (k in body) { fields.push(`${k} = $${i++}`); params.push(body[k]); }
    }
    fields.push(`updated_at = $${i++}`); params.push(now);
    params.push(m[1]);
    await db.query(`update leads set ${fields.join(', ')} where id = $${i}`, params);
    return db.json(res, 200, { ok: true });
  }

  if (m && req.method === 'DELETE') {
    await db.query('delete from leads where id = $1', [m[1]]);
    return db.json(res, 200, { ok: true });
  }

  return db.json(res, 404, { error: 'not found' });
};
