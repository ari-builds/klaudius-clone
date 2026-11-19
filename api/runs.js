// Autonomous runs — find, gather, build, pitch pipeline per target.
const db = require('./_db');

module.exports = async (req, res) => {
  if (db.cors(req, res)) return;
  const path = req.url.split('?')[0];
  const m = path.match(/^\/api\/runs\/([^/]+)$/);

  try { await db.ready(); } catch (e) {
    return db.json(res, 500, { error: 'Database unavailable' });
  }

  if (path === '/api/runs' && req.method === 'GET') {
    const rows = await db.query('select * from runs order by created_at desc');
    return db.json(res, 200, { ok: true, runs: rows });
  }

  if (path === '/api/runs' && req.method === 'POST') {
    const body = await db.parseBody(req);
    const id = db.newId('run_');
    const now = new Date().toISOString();
    await db.query(
      `insert into runs (id, user_id, target_id, phase, status, progress, result, started_at, finished_at, created_at, updated_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [id, 'demo-user', body.target_id, 'find', 'idle', 0, JSON.stringify({}), null, null, now, now]
    );
    return db.json(res, 201, { ok: true, run: { id, phase: 'find', status: 'idle', progress: 0 } });
  }

  if (m && req.method === 'PATCH') {
    const body = await db.parseBody(req);
    const now = new Date().toISOString();
    const fields = [];
    const params = [];
    let i = 1;
    for (const k of ['phase','status','progress','result','started_at','finished_at']) {
      if (k in body) { fields.push(`${k} = $${i++}`); params.push(typeof body[k] === 'object' ? JSON.stringify(body[k]) : body[k]); }
    }
    fields.push(`updated_at = $${i++}`); params.push(now);
    params.push(m[1]);
    await db.query(`update runs set ${fields.join(', ')} where id = $${i}`, params);
    return db.json(res, 200, { ok: true });
  }

  if (m && req.method === 'DELETE') {
    await db.query('delete from runs where id = $1', [m[1]]);
    return db.json(res, 200, { ok: true });
  }

  return db.json(res, 404, { error: 'not found' });
};
