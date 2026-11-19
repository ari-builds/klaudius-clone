// Auth + user profile for Klaudius platform.
const db = require('./_db');

module.exports = async (req, res) => {
  if (db.cors(req, res)) return;
  const path = req.url.split('?')[0];

  try { await db.ready(); } catch (e) {
    return db.json(res, 500, { error: 'Database unavailable' });
  }

  // GET /api/auth/me — current user (demo: returns/create a single user)
  if (path === '/api/auth/me' && req.method === 'GET') {
    const rows = await db.query('select * from users order by created_at desc limit 1');
    let user = rows[0];
    if (!user) {
      const id = db.newId('user_');
      const now = new Date().toISOString();
      await db.query(
        'insert into users (id, email, name, plan, region, status, created_at, updated_at) values ($1,$2,$3,$4,$5,$6,$7,$8)',
        [id, 'founder@klaudius.dev', 'Founder', 'starter', '', 'active', now, now]
      );
      user = { id, email: 'founder@klaudius.dev', name: 'Founder', plan: 'starter', region: '', status: 'active' };
    }
    return db.json(res, 200, { ok: true, user });
  }

  // PATCH /api/auth/me — update profile (region, plan, name)
  if (path === '/api/auth/me' && req.method === 'PATCH') {
    const body = await db.parseBody(req);
    const rows = await db.query('select * from users order by created_at desc limit 1');
    const now = new Date().toISOString();
    let user;
    if (rows[0]) {
      user = rows[0];
      await db.query(
        `update users set name = coalesce($1, name), region = coalesce($2, region), plan = coalesce($3, plan), updated_at = $4 where id = $5`,
        [body.name, body.region, body.plan, now, user.id]
      );
    } else {
      user = { id: db.newId('user_'), email: 'founder@klaudius.dev', name: body.name || 'Founder', region: body.region || '', plan: body.plan || 'starter', status: 'active' };
      await db.query(
        'insert into users (id, email, name, region, plan, status, created_at, updated_at) values ($1,$2,$3,$4,$5,$6,$7,$8)',
        [user.id, user.email, user.name, user.region, user.plan, user.status, now, now]
      );
    }
    return db.json(res, 200, { ok: true, user });
  }

  return db.json(res, 404, { error: 'not found' });
};
