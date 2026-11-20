// CRM leads — every real lead must state where it came from and, if scored, why.
// Samples are labelled and never enter the real automation queue.
const db = require('./_db');

const ALLOWED_PATCH = [
  'status', 'score', 'name', 'phone', 'email', 'address', 'niche', 'has_website',
  'last_contacted_at', 'details', 'photos', 'source', 'source_url',
  'score_basis', 'verified_at', 'intake_status',
];

module.exports = async (req, res) => {
  if (db.cors(req, res)) return;
  const path = req.url.split('?')[0];
  const m = path.match(/^\/api\/leads\/([^/]+)$/);

  try { await db.ready(); } catch (e) {
    return db.json(res, 500, { error: 'Database unavailable' });
  }

  if (path === '/api/leads' && req.method === 'GET') {
    const params = new URL(req.url, 'http://x').searchParams;
    const status = params.get('status');
    const queue = params.get('queue');
    let sql = 'select * from leads where 1=1';
    const args = [];
    if (status) { sql += ' and status = $' + (args.push(status)); }
    if (queue === 'real') sql += " and intake_status = 'verified'";
    sql += ' order by score desc, created_at desc';
    const rows = await db.query(sql, args);
    return db.json(res, 200, { ok: true, leads: rows });
  }

  if (path === '/api/leads' && req.method === 'POST') {
    let body;
    try { body = await db.parseBody(req); } catch { return db.json(res, 400, { error: 'Invalid request body' }); }
    const name = String(body.name || '').trim();
    const source = String(body.source || '').trim();
    if (!name) return db.json(res, 400, { error: 'Business name is required' });
    if (!source) return db.json(res, 400, { error: 'A non-empty source is required — where did this lead come from?' });

    const details = db.parseJson(body.details, {});
    const isSample = source.toLowerCase() === 'sample' || body.sample === true || details.sample === true;
    const verified = body.verified === true && !isSample;
    const score = Number(body.score) || 0;
    const scoreBasis = String(body.score_basis || '').trim();
    if (score > 0 && !scoreBasis) return db.json(res, 400, { error: 'A score above zero requires a score_basis explaining it' });

    const id = db.newId('lead_');
    const now = new Date().toISOString();
    const verifiedAt = verified ? now : null;
    const intakeStatus = isSample ? 'sample' : (verified ? 'verified' : 'unverified');
    await db.query(
      `insert into leads (id, user_id, target_id, name, website, phone, email, address, niche, has_website,
        status, score, photos, details, last_contacted_at, source, source_url, verified_at, intake_status,
        score_basis, created_at, updated_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,null,$15,$16,$17,$18,$19,$20,$21)`,
      [id, 'demo-user', String(body.target_id || ''), name, String(body.website || ''), String(body.phone || ''),
       String(body.email || ''), String(body.address || ''), String(body.niche || ''), body.has_website ? 1 : 0,
       String(body.status || 'new'), score, JSON.stringify(body.photos || []), JSON.stringify(body.details || {}),
       source, String(body.source_url || ''), verifiedAt, intakeStatus, scoreBasis, now, now]
    );
    await db.recordEvent(id, 'intake', `Source: ${source}. Intake: ${intakeStatus}. Score: ${score}${scoreBasis ? ' (' + scoreBasis + ')' : ''}.`);
    return db.json(res, 201, {
      ok: true,
      lead: { id, name, status: String(body.status || 'new'), score, source, intake_status: intakeStatus, verified_at: verifiedAt },
    });
  }

  if (m && req.method === 'PATCH') {
    let body;
    try { body = await db.parseBody(req); } catch { return db.json(res, 400, { error: 'Invalid request body' }); }
    const rows = await db.query('select * from leads where id = $1', [m[1]]);
    if (!rows.length) return db.json(res, 404, { error: 'lead not found' });
    const lead = rows[0];
    const now = new Date().toISOString();
    const changes = {};
    for (const k of ALLOWED_PATCH) if (k in body) changes[k] = body[k];

    if ('name' in changes && !String(changes.name || '').trim()) return db.json(res, 400, { error: 'Business name cannot be empty' });
    if ('source' in changes && !String(changes.source || '').trim()) return db.json(res, 400, { error: 'Source cannot be empty' });
    if ('intake_status' in changes && !['sample', 'verified', 'unverified'].includes(changes.intake_status)) {
      return db.json(res, 400, { error: 'Invalid intake_status' });
    }

    // Verification is a timestamp, never a bare claim from the client.
    if (lead.intake_status === 'sample' && body.verified === true && !('source' in changes)) {
      return db.json(res, 400, { error: 'Give the sample a real source before verifying it' });
    }
    if (body.verified === true) { changes.verified_at = now; changes.intake_status = 'verified'; }
    if (changes.intake_status === 'verified' && !changes.verified_at && !lead.verified_at) changes.verified_at = now;
    if (changes.intake_status === 'unverified' || changes.intake_status === 'sample') changes.verified_at = null;
    if (lead.intake_status === 'sample' && !('intake_status' in changes)) changes.intake_status = 'sample';
    if ('verified_at' in changes && changes.verified_at && changes.intake_status !== 'sample') changes.intake_status = 'verified';
    if ('verified_at' in changes && !changes.verified_at && changes.intake_status !== 'sample' && changes.intake_status !== 'unverified') {
      changes.intake_status = 'unverified';
    }

    const merged = { ...lead, ...changes };
    if (!String(merged.source || '').trim()) return db.json(res, 400, { error: 'A source is required before a lead can be updated' });
    if (Number(merged.score) > 0 && !String(merged.score_basis || '').trim()) {
      return db.json(res, 400, { error: 'A score above zero requires a score_basis explaining it' });
    }

    if ('has_website' in changes) changes.has_website = changes.has_website ? 1 : 0;
    if ('score' in changes) changes.score = Number(changes.score) || 0;
    if ('details' in changes || 'photos' in changes) {
      if ('details' in changes) changes.details = JSON.stringify(changes.details || {});
      if ('photos' in changes) changes.photos = JSON.stringify(changes.photos || []);
    }
    changes.updated_at = now;

    const keys = Object.keys(changes);
    const params = keys.map((k) => changes[k]);
    params.push(m[1]);
    await db.query(`update leads set ${keys.map((k, i) => `${k} = $${i + 1}`).join(', ')} where id = $${keys.length + 1}`, params);

    if (changes.intake_status === 'verified' && lead.intake_status !== 'verified') {
      await db.recordEvent(m[1], 'verified', 'Human confirmed this lead and its details.');
    }
    return db.json(res, 200, { ok: true });
  }

  if (m && req.method === 'DELETE') {
    await db.query('delete from lead_events where lead_id = $1', [m[1]]);
    await db.query('delete from leads where id = $1', [m[1]]);
    return db.json(res, 200, { ok: true });
  }

  return db.json(res, 404, { error: 'not found' });
};
