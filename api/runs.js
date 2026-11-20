// Autonomous runs — an honest pipeline: intake -> build -> draft -> review -> done.
// It does NOT discover or gather businesses, does not publish sites, and sends
// nothing. Every number in the stored result comes from work actually performed.
const db = require('./_db');

function safeError(e) {
  let m = String((e && e.message) || e || 'Unknown error');
  if (/DATABASE_URL|neon-connection-string|postgres(ql)?:\/\//i.test(m)) m = 'Database error (details withheld)';
  return m.replace(/\s+/g, ' ').slice(0, 200);
}

async function setPhase(id, phase, progress, status = 'running') {
  const now = new Date().toISOString();
  await db.query('update runs set phase = $1, progress = $2, status = $3, updated_at = $4 where id = $5',
    [phase, progress, status, now, id]);
}

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

  if (m && req.method === 'GET') {
    const rows = await db.query('select * from runs where id = $1', [m[1]]);
    if (!rows.length) return db.json(res, 404, { error: 'run not found' });
    return db.json(res, 200, { ok: true, run: rows[0] });
  }

  if (path === '/api/runs' && req.method === 'POST') {
    let body;
    try { body = await db.parseBody(req); } catch { return db.json(res, 400, { error: 'Invalid request body' }); }
    let targetId = String(body.target_id || '').trim();
    if (!targetId) {
      const targets = await db.query('select id from targets order by created_at desc limit 1');
      if (!targets.length) return db.json(res, 400, { error: 'Add a target region first' });
      targetId = targets[0].id;
    }

    const id = db.newId('run_');
    const now = new Date().toISOString();
    await db.query(
      `insert into runs (id, user_id, target_id, phase, status, progress, result, started_at, finished_at, created_at, updated_at)
       values ($1,'demo-user',$2,'intake','running',0,'{}',$3,null,$3,$3)`,
      [id, targetId, now]
    );

    // The only real queue: human-verified leads that do not yet have a site.
    // Samples and unverified leads are deliberately excluded.
    const todo = await db.query(
      `select l.* from leads l
       where l.intake_status = 'verified'
         and not exists (select 1 from sites s where s.lead_id = l.id)
       order by l.created_at asc`
    );
    const result = { sitesGenerated: 0, draftsCreated: 0, reviewTasksQueued: 0, errors: [], leadsConsidered: todo.length };
    const built = [];

    await setPhase(id, 'intake', 10);
    await setPhase(id, 'build', 35);
    for (const lead of todo) {
      try {
        const site = await db.createPreviewSite(lead, { req });
        result.sitesGenerated += 1;
        built.push({ lead, site });
        await db.enqueueReview({
          kind: 'site_approval', refId: site.id, leadId: lead.id, siteId: site.id, runId: id,
          note: 'Site preview generated from supplied details — approve before publishing.',
        });
        result.reviewTasksQueued += 1;
      } catch (e) {
        result.errors.push({ phase: 'build', leadId: lead.id, message: safeError(e) });
      }
    }

    await setPhase(id, 'draft', 65);
    for (const { lead, site } of built) {
      try {
        const draft = await db.createDraft({ lead, site, step: 1 });
        result.draftsCreated += 1;
        await db.enqueueReview({
          kind: 'draft_approval', refId: draft.id, leadId: lead.id, siteId: site.id, runId: id,
          note: 'Grounded draft ready for review — nothing has been sent.',
        });
        result.reviewTasksQueued += 1;
      } catch (e) {
        result.errors.push({ phase: 'draft', leadId: lead.id, message: safeError(e) });
      }
    }

    await setPhase(id, 'review', 90);
    await setPhase(id, 'done', 100, 'completed');
    await db.query("update runs set result = $1, finished_at = $2, updated_at = $2 where id = $3",
      [JSON.stringify(result), new Date().toISOString(), id]);

    return db.json(res, 201, { ok: true, run: { id, phase: 'done', status: 'completed', result } });
  }

  if (m && req.method === 'PATCH') {
    let body;
    try { body = await db.parseBody(req); } catch { return db.json(res, 400, { error: 'Invalid request body' }); }
    // Results and timestamps are outcomes of real work, never client input.
    for (const k of ['result', 'progress', 'started_at', 'finished_at']) {
      if (k in body) return db.json(res, 400, { error: `Field "${k}" cannot be set by the client` });
    }
    const changes = {};
    if ('phase' in body) {
      if (!['intake', 'build', 'draft', 'review', 'done'].includes(body.phase)) return db.json(res, 400, { error: 'Invalid phase' });
      changes.phase = body.phase;
    }
    if ('status' in body) {
      if (!['cancelled', 'archived'].includes(body.status)) return db.json(res, 400, { error: 'Invalid status' });
      changes.status = body.status;
    }
    if (!Object.keys(changes).length) return db.json(res, 400, { error: 'No allowed fields supplied' });
    changes.updated_at = new Date().toISOString();
    const keys = Object.keys(changes);
    const params = keys.map((k) => changes[k]);
    params.push(m[1]);
    await db.query(`update runs set ${keys.map((k, i) => `${k} = $${i + 1}`).join(', ')} where id = $${keys.length + 1}`, params);
    return db.json(res, 200, { ok: true });
  }

  if (m && req.method === 'DELETE') {
    await db.query('delete from runs where id = $1', [m[1]]);
    return db.json(res, 200, { ok: true });
  }

  return db.json(res, 404, { error: 'not found' });
};
