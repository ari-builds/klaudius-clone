// AI Receptionist — a phone number per business that answers missed calls.
const db = require('./_db');

module.exports = async (req, res) => {
  if (db.cors(req, res)) return;
  const path = req.url.split('?')[0];
  const m = path.match(/^\/api\/receptionists\/([^/]+)$/);

  try { await db.ready(); } catch (e) {
    return db.json(res, 500, { error: 'Database unavailable' });
  }

  if (path === '/api/receptionists' && req.method === 'GET') {
    const rows = await db.query('select * from receptionists order by created_at desc');
    return db.json(res, 200, { ok: true, receptionists: rows });
  }

  if (path === '/api/receptionists' && req.method === 'POST') {
    const body = await db.parseBody(req);
    const id = db.newId('rec_');
    const now = new Date().toISOString();
    await db.query(
      `insert into receptionists (id, user_id, phone_number, voice, greeting, business_id, status, created_at, updated_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [id, 'demo-user', body.phone_number, body.voice || 'alloy', body.greeting || '', body.business_id || '', 'active', now, now]
    );
    return db.json(res, 201, { ok: true, receptionist: { id, phone_number: body.phone_number, status: 'active' } });
  }

  if (m && req.method === 'PATCH') {
    const body = await db.parseBody(req);
    const now = new Date().toISOString();
    const fields = [];
    const params = [];
    let i = 1;
    for (const k of ['status','voice','greeting','phone_number','business_id']) {
      if (k in body) { fields.push(`${k} = $${i++}`); params.push(body[k]); }
    }
    fields.push(`updated_at = $${i++}`); params.push(now);
    params.push(m[1]);
    await db.query(`update receptionists set ${fields.join(', ')} where id = $${i}`, params);
    return db.json(res, 200, { ok: true });
  }

  if (m && req.method === 'DELETE') {
    await db.query('delete from receptionists where id = $1', [m[1]]);
    return db.json(res, 200, { ok: true });
  }

  return db.json(res, 404, { error: 'not found' });
};
