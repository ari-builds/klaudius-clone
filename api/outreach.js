// Outreach — personalized pitch messages and 5-touch sequences per lead.
const db = require('./_db');

module.exports = async (req, res) => {
  if (db.cors(req, res)) return;
  const path = req.url.split('?')[0];
  const m = path.match(/^\/api\/outreach\/([^/]+)$/);

  try { await db.ready(); } catch (e) {
    return db.json(res, 500, { error: 'Database unavailable' });
  }

  if (path === '/api/outreach' && req.method === 'GET') {
    const rows = await db.query('select * from outreach order by created_at desc');
    return db.json(res, 200, { ok: true, outreach: rows });
  }

  if (path === '/api/outreach' && req.method === 'POST') {
    const body = await db.parseBody(req);
    const id = db.newId('out_');
    const now = new Date().toISOString();
    await db.query(
      `insert into outreach (id, user_id, lead_id, channel, sequence_step, subject, body, status, sent_at, replied_at, reply_text, created_at, updated_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [id, 'demo-user', body.lead_id, body.channel || 'email', body.sequence_step || 1, body.subject || '', body.body || '',
       body.status || 'pending', body.status === 'sent' ? now : null, null, '', now, now]
    );
    return db.json(res, 201, { ok: true, outreach: { id, sequence_step: body.sequence_step || 1, status: body.status || 'pending' } });
  }

  if (m && req.method === 'PATCH') {
    const body = await db.parseBody(req);
    const now = new Date().toISOString();
    const fields = [];
    const params = [];
    let i = 1;
    for (const k of ['status','subject','body','sequence_step','sent_at','replied_at','reply_text','channel']) {
      if (k in body) { fields.push(`${k} = $${i++}`); params.push(body[k]); }
    }
    fields.push(`updated_at = $${i++}`); params.push(now);
    params.push(m[1]);
    await db.query(`update outreach set ${fields.join(', ')} where id = $${i}`, params);
    return db.json(res, 200, { ok: true });
  }

  if (m && req.method === 'DELETE') {
    await db.query('delete from outreach where id = $1', [m[1]]);
    return db.json(res, 200, { ok: true });
  }

  return db.json(res, 404, { error: 'not found' });
};
