// Sites — every generated site is a private preview until a human publishes it.
// published_at is server-owned: clients cannot invent a publish timestamp.
const crypto = require('crypto');
const db = require('./_db');

function previewUrlFor(site) {
  const pages = db.parseJson(site.pages, []);
  const slug = pages[0] && pages[0].slug;
  return slug ? `/api/site?slug=${encodeURIComponent(slug)}&token=${encodeURIComponent(site.preview_token || '')}` : '';
}

module.exports = async (req, res) => {
  if (db.cors(req, res)) return;
  const path = req.url.split('?')[0];
  const m = path.match(/^\/api\/sites\/([^/]+)$/);

  try { await db.ready(); } catch (e) {
    return db.json(res, 500, { error: 'Database unavailable' });
  }

  if (path === '/api/sites' && req.method === 'GET') {
    const rows = await db.query('select * from sites order by created_at desc');
    return db.json(res, 200, { ok: true, sites: rows.map((s) => ({ ...s, previewUrl: previewUrlFor(s) })) });
  }

  if (path === '/api/sites' && req.method === 'POST') {
    let body;
    try { body = await db.parseBody(req); } catch { return db.json(res, 400, { error: 'Invalid request body' }); }
    if ('published_at' in body || 'publish' in body || body.status === 'published') {
      return db.json(res, 400, { error: 'Publishing requires an explicit PATCH with publish: true after human review' });
    }
    const id = db.newId('site_');
    const now = new Date().toISOString();
    const token = crypto.randomBytes(12).toString('hex');
    await db.query(
      `insert into sites (id, user_id, lead_id, url, title, design_system, pages, status, published_at, preview_token, created_at, updated_at)
       values ($1,'demo-user',$2,$3,$4,$5,$6,'preview',null,$7,$8,$8)`,
      [id, String(body.lead_id || ''), String(body.url || ''), String(body.title || ''),
       JSON.stringify(body.design_system || {}), JSON.stringify(body.pages || []), token, now]
    );
    return db.json(res, 201, { ok: true, site: { id, url: body.url || '', status: 'preview', previewUrl: `/api/site?token=${token}` } });
  }

  if (m && req.method === 'PATCH') {
    let body;
    try { body = await db.parseBody(req); } catch { return db.json(res, 400, { error: 'Invalid request body' }); }
    if ('published_at' in body) return db.json(res, 400, { error: 'published_at is set by the server when you publish' });
    if (body.status === 'published' && body.publish !== true) {
      return db.json(res, 400, { error: 'Use publish: true to publish after human review' });
    }
    const changes = {};
    for (const k of ['status', 'title', 'url', 'design_system', 'pages']) if (k in body) changes[k] = body[k];
    if ('status' in changes && !['preview', 'draft', 'archived'].includes(changes.status)) {
      return db.json(res, 400, { error: 'Invalid status' });
    }
    if ('design_system' in changes || 'pages' in changes) {
      if ('design_system' in changes) changes.design_system = JSON.stringify(changes.design_system || {});
      if ('pages' in changes) changes.pages = JSON.stringify(changes.pages || []);
    }
    const now = new Date().toISOString();
    if (body.publish === true) {
      changes.status = 'published';
      changes.published_at = now;
    }
    changes.updated_at = now;
    const keys = Object.keys(changes);
    const params = keys.map((k) => changes[k]);
    params.push(m[1]);
    await db.query(`update sites set ${keys.map((k, i) => `${k} = $${i + 1}`).join(', ')} where id = $${keys.length + 1}`, params);
    if (body.publish === true) {
      await db.query("update review_tasks set status = 'done', note = 'Site preview published by you', updated_at = $1 where site_id = $2 and kind = 'site_approval' and status = 'pending'", [now, m[1]]);
    }
    return db.json(res, 200, { ok: true, status: changes.status, published_at: changes.published_at || null });
  }

  if (m && req.method === 'DELETE') {
    await db.query("update review_tasks set status = 'done', updated_at = $1 where site_id = $2", [new Date().toISOString(), m[1]]);
    await db.query('delete from sites where id = $1', [m[1]]);
    return db.json(res, 200, { ok: true });
  }

  return db.json(res, 404, { error: 'not found' });
};
