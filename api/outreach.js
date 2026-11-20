// Outreach — server-grounded pitch drafts and a human review queue.
// Drafts are built ONLY from the lead name, supplied services and generated site
// URL. Nothing is ever sent automatically. This file never reports a fake send.
const db = require('./_db');

// Client-supplied send/reply/provider state is rejected everywhere.
const FAKE_STATE_FIELDS = [
  'sent_at', 'replied_at', 'reply_text', 'provider', 'provider_id', 'provider_message_id',
  'message_id', 'external_id', 'sid', 'twilio_sid', 'sendgrid_id',
];
// These are owned by the server's review and orchestration handlers.
const SERVER_FIELDS = [
  'status', 'approval_status', 'approved_at', 'approved_by', 'source_snapshot',
  'site_id', 'next_follow_up_at', 'send_note', 'sequence_step',
];

function forbidden(body, keys) {
  for (const k of keys) if (Object.prototype.hasOwnProperty.call(body, k)) return k;
  return null;
}

module.exports = async (req, res) => {
  if (db.cors(req, res)) return;
  const parts = req.url.split('?')[0].split('/').filter(Boolean); // api / outreach / sub / id
  const sub = parts[2] || '';
  const subId = parts[3] || '';
  const isAction = (name) => sub === name && req.method === 'POST';

  try { await db.ready(); } catch (e) {
    return db.json(res, 500, { error: 'Database unavailable' });
  }

  // ---- List all drafts (Outreach table) ----
  if (!sub && req.method === 'GET') {
    const rows = await db.query('select * from outreach order by created_at desc');
    return db.json(res, 200, { ok: true, outreach: rows });
  }

  // ---- Create a grounded draft from the real lead + its generated site ----
  if (!sub && req.method === 'POST') {
    let body;
    try { body = await db.parseBody(req); } catch { return db.json(res, 400, { error: 'Invalid request body' }); }
    const bad = forbidden(body, [...FAKE_STATE_FIELDS, ...SERVER_FIELDS]);
    if (bad) return db.json(res, 400, { error: `Client-provided field "${bad}" is not allowed` });

    const leadId = String(body.lead_id || '').trim();
    if (!leadId) return db.json(res, 400, { error: 'lead_id is required' });
    const leadRows = await db.query('select * from leads where id = $1', [leadId]);
    if (!leadRows.length) return db.json(res, 404, { error: 'lead not found' });
    const lead = leadRows[0];
    if (lead.intake_status === 'sample') return db.json(res, 400, { error: 'Sample leads cannot be pitched' });
    if (lead.intake_status !== 'verified') return db.json(res, 403, { error: 'Verify this lead before drafting a pitch' });

    const siteRows = await db.query('select * from sites where lead_id = $1 order by created_at desc limit 1', [leadId]);
    if (!siteRows.length) return db.json(res, 400, { error: 'Generate a site preview before preparing a pitch' });
    const site = siteRows[0];

    const draft = await db.createDraft({ lead, site, step: body.step || 1 });
    await db.enqueueReview({
      kind: 'draft_approval', refId: draft.id, leadId, siteId: site.id,
      note: 'Grounded draft ready for human review. Nothing has been sent.',
    });
    return db.json(res, 201, { ok: true, outreach: draft, note: 'Draft only — nothing was sent.' });
  }

  // ---- Review / follow-up queue ----
  if (sub === 'review' && !subId && req.method === 'GET') {
    const rows = await db.query(
      `select rt.id as task_id, rt.ref_id, rt.kind, rt.note as task_note, rt.status as task_status,
              rt.created_at as task_created_at,
              o.id, o.lead_id, o.site_id, o.sequence_step, o.subject, o.body, o.status,
              o.approval_status, o.approved_at, o.source_snapshot, o.next_follow_up_at,
              o.sent_at, o.send_note,
              l.name as lead_name, l.intake_status, l.source as lead_source,
              s.url as site_url, s.status as site_status, s.preview_token
       from review_tasks rt
       left join outreach o on o.id = rt.ref_id
       left join leads l on l.id = coalesce(o.lead_id, rt.lead_id)
       left join sites s on s.id = coalesce(o.site_id, rt.site_id)
       where rt.status = 'pending'
       order by rt.created_at desc`
    );
    return db.json(res, 200, { ok: true, queue: rows, count: rows.length });
  }

  // ---- Snooze a follow-up or dismiss a review task ----
  if (sub === 'review' && subId && req.method === 'PATCH') {
    let body;
    try { body = await db.parseBody(req); } catch { return db.json(res, 400, { error: 'Invalid request body' }); }
    const bad = forbidden(body, [...FAKE_STATE_FIELDS, ...SERVER_FIELDS.filter((k) => k !== 'next_follow_up_at')]);
    if (bad) return db.json(res, 400, { error: `Client-provided field "${bad}" is not allowed` });
    const taskRows = await db.query('select * from review_tasks where id = $1', [subId]);
    if (!taskRows.length) return db.json(res, 404, { error: 'review task not found' });
    const task = taskRows[0];
    const now = new Date().toISOString();

    if (body.done === true) {
      await db.query("update review_tasks set status = 'done', updated_at = $1 where id = $2", [now, subId]);
      return db.json(res, 200, { ok: true });
    }
    if ('next_follow_up_at' in body) {
      let when = body.next_follow_up_at;
      if (when !== null && when !== '') {
        const d = new Date(when);
        if (isNaN(d.getTime())) return db.json(res, 400, { error: 'Invalid next_follow_up_at' });
        when = d.toISOString();
      } else when = null;
      if (task.ref_id) await db.query('update outreach set next_follow_up_at = $1, updated_at = $2 where id = $3', [when, now, task.ref_id]);
      await db.query('update review_tasks set note = $1, updated_at = $2 where id = $3',
        [`Follow-up rescheduled: ${when || 'cleared'}`, now, subId]);
      return db.json(res, 200, { ok: true, next_follow_up_at: when });
    }
    return db.json(res, 400, { error: 'Provide next_follow_up_at or done' });
  }

  // ---- Human approves a draft (still not sent) ----
  if (isAction('approve')) {
    let body;
    try { body = await db.parseBody(req); } catch { return db.json(res, 400, { error: 'Invalid request body' }); }
    const bad = forbidden(body, [...FAKE_STATE_FIELDS, ...SERVER_FIELDS]);
    if (bad) return db.json(res, 400, { error: `Client-provided field "${bad}" is not allowed` });
    const id = String(body.id || '').trim();
    if (!id) return db.json(res, 400, { error: 'id is required' });
    const rows = await db.query('select * from outreach where id = $1', [id]);
    if (!rows.length) return db.json(res, 404, { error: 'draft not found' });
    if (rows[0].sent_at) return db.json(res, 400, { error: 'This message has already been confirmed as sent' });
    const now = new Date().toISOString();
    await db.query(
      "update outreach set approval_status = 'approved', approved_at = $1, approved_by = 'demo-user', updated_at = $1 where id = $2",
      [now, id]
    );
    await db.query("update review_tasks set note = 'Approved by you — awaiting manual send', updated_at = $1 where ref_id = $2 and status = 'pending'", [now, id]);
    return db.json(res, 200, { ok: true, id, approval_status: 'approved', approved_at: now });
  }

  // ---- Human confirms THEY sent it; the server records the real timestamp ----
  if (isAction('confirm-send')) {
    let body;
    try { body = await db.parseBody(req); } catch { return db.json(res, 400, { error: 'Invalid request body' }); }
    const bad = forbidden(body, [...FAKE_STATE_FIELDS, ...SERVER_FIELDS]);
    if (bad) return db.json(res, 400, { error: `Client-provided field "${bad}" is not allowed` });
    const id = String(body.id || '').trim();
    if (!id) return db.json(res, 400, { error: 'id is required' });
    const note = String(body.note || '').trim().slice(0, 500);
    const rows = await db.query('select * from outreach where id = $1', [id]);
    if (!rows.length) return db.json(res, 404, { error: 'draft not found' });
    if (rows[0].sent_at) return db.json(res, 400, { error: 'Already confirmed as sent' });
    if (rows[0].approval_status !== 'approved') return db.json(res, 400, { error: 'Approve the draft before confirming a manual send' });
    const now = new Date().toISOString();
    await db.query(
      "update outreach set status = 'sent_by_user', sent_at = $1, send_note = $2, updated_at = $1 where id = $3",
      [now, note, id]
    );
    await db.query("update review_tasks set status = 'done', note = $1, updated_at = $2 where ref_id = $3 and status = 'pending'",
      [`User confirmed manual send. Note: ${note || '(none)'}`, now, id]);
    await db.recordEvent(rows[0].lead_id, 'manual_send_confirmed', 'User confirmed they sent the pitch themselves.');
    return db.json(res, 200, { ok: true, id, status: 'sent_by_user', sent_at: now });
  }

  // ---- Create the next grounded follow-up draft on request ----
  if (isAction('followup')) {
    let body;
    try { body = await db.parseBody(req); } catch { return db.json(res, 400, { error: 'Invalid request body' }); }
    const bad = forbidden(body, [...FAKE_STATE_FIELDS, ...SERVER_FIELDS]);
    if (bad) return db.json(res, 400, { error: `Client-provided field "${bad}" is not allowed` });
    const id = String(body.id || '').trim();
    if (!id) return db.json(res, 400, { error: 'id is required' });
    const rows = await db.query('select * from outreach where id = $1', [id]);
    if (!rows.length) return db.json(res, 404, { error: 'draft not found' });
    const original = rows[0];
    const nextStep = Number(original.sequence_step) + 1;
    if (nextStep > 5) return db.json(res, 400, { error: 'Maximum of 5 sequence steps reached' });

    const leadRows = await db.query('select * from leads where id = $1', [original.lead_id]);
    if (!leadRows.length) return db.json(res, 404, { error: 'lead not found' });
    const lead = leadRows[0];
    if (lead.intake_status === 'sample' || lead.intake_status !== 'verified') {
      return db.json(res, 403, { error: 'Lead is not verified; no follow-up drafted' });
    }
    let siteRows = [];
    if (original.site_id) siteRows = await db.query('select * from sites where id = $1', [original.site_id]);
    if (!siteRows.length) siteRows = await db.query('select * from sites where lead_id = $1 order by created_at desc limit 1', [original.lead_id]);
    if (!siteRows.length) return db.json(res, 400, { error: 'No generated site URL to ground the follow-up' });

    const draft = await db.createDraft({ lead, site: siteRows[0], step: nextStep });
    await db.enqueueReview({
      kind: 'followup', refId: draft.id, leadId: lead.id, siteId: siteRows[0].id,
      note: `Follow-up step ${draft.sequence_step} drafted from name/services/site URL.`,
    });
    await db.query('update outreach set next_follow_up_at = null, updated_at = $1 where id = $2', [new Date().toISOString(), id]);
    return db.json(res, 201, { ok: true, outreach: draft, note: 'Follow-up draft only — nothing was sent.' });
  }

  // ---- Edit draft text only (never send/reply/approval state) ----
  if (sub && subId && !['review', 'approve', 'confirm-send', 'followup'].includes(sub) && req.method === 'PATCH') {
    let body;
    try { body = await db.parseBody(req); } catch { return db.json(res, 400, { error: 'Invalid request body' }); }
    const bad = forbidden(body, [...FAKE_STATE_FIELDS, ...SERVER_FIELDS]);
    if (bad) return db.json(res, 400, { error: `Client-provided field "${bad}" is not allowed` });
    const rows = await db.query('select * from outreach where id = $1', [subId]);
    if (!rows.length) return db.json(res, 404, { error: 'draft not found' });
    if (rows[0].sent_at) return db.json(res, 400, { error: 'A confirmed sent message cannot be edited' });
    const changes = {};
    for (const k of ['subject', 'body']) if (k in body) changes[k] = String(body[k] || '').slice(0, 5000);
    if (!Object.keys(changes).length) return db.json(res, 400, { error: 'Only subject and body can be edited' });
    changes.updated_at = new Date().toISOString();
    const keys = Object.keys(changes);
    const params = keys.map((k) => changes[k]);
    params.push(subId);
    await db.query(`update outreach set ${keys.map((k, i) => `${k} = $${i + 1}`).join(', ')} where id = $${keys.length + 1}`, params);
    return db.json(res, 200, { ok: true });
  }

  if (sub && subId && !['review', 'approve', 'confirm-send', 'followup'].includes(sub) && req.method === 'DELETE') {
    const now = new Date().toISOString();
    await db.query("update review_tasks set status = 'done', updated_at = $1 where ref_id = $2", [now, subId]);
    await db.query('delete from outreach where id = $1', [subId]);
    return db.json(res, 200, { ok: true });
  }

  return db.json(res, 404, { error: 'not found' });
};
