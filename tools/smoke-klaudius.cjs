// End-to-end honesty smoke test for the personal Klaudius tool.
// Runs against local `vercel dev` by default: BASE_URL=http://localhost:3001 node tools/smoke-klaudius.cjs
// Creates clearly-labelled throwaway records and deletes them at the end.
// No provider is contacted and nothing is sent. No secrets are read or printed.

'use strict';

const BASE = (process.env.BASE_URL || 'http://localhost:3001').replace(/\/$/, '');
let passed = 0;
let failed = 0;

async function request(apiPath, { method = 'GET', body, raw = false } = {}) {
  const headers = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  const res = await fetch(BASE + apiPath, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let value = {};
  try {
    value = raw ? await res.text() : await res.json();
  } catch {}
  return { res, value };
}

async function check(name, fn) {
  try {
    const detail = await fn();
    passed += 1;
    console.log(`PASS ${name}${detail ? ` — ${detail}` : ''}`);
    return true;
  } catch (err) {
    failed += 1;
    console.log(`FAIL ${name} — ${err && err.message ? err.message : String(err)}`);
    return false;
  }
}

function must(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  console.log(`Klaudius honesty smoke: ${BASE}`);
  const suffix = Date.now();
  const leadIds = [];
  const siteIds = [];
  const draftIds = [];
  let targetId = '';
  let targetCreated = false;

  try {
    await check('seed target region if needed', async () => {
      const { value } = await request('/api/targets');
      if ((value.targets || []).length) {
        targetId = value.targets[0].id;
        return `using existing target ${targetId}`;
      }
      const created = await request('/api/targets', {
        method: 'POST',
        body: { region: `__smoke_region_${suffix}__`, niche: 'smoke test' },
      });
      must(created.res.ok, created.value.error || `HTTP ${created.res.status}`);
      targetId = created.value.target.id;
      targetCreated = true;
      return `created target ${targetId}`;
    });

    await check('lead intake rejects missing source', async () => {
      const { res, value } = await request('/api/leads', {
        method: 'POST',
        body: { name: `__smoke_no_source_${suffix}__` },
      });
      must(res.status === 400, `expected 400, got ${res.status}`);
      must(/source/i.test(value.error || ''), `unexpected error: ${value.error}`);
      return '400 source required';
    });

    await check('create verified throwaway lead', async () => {
      const { res, value } = await request('/api/leads', {
        method: 'POST',
        body: {
          name: `__smoke_business_${suffix}__`,
          source: 'smoke-test: automated temporary record',
          source_url: 'https://example.invalid/smoke-intake',
          verified: true,
          details: { services: ['Test Service'] },
          target_id: targetId,
        },
      });
      must(res.ok, value.error || `HTTP ${res.status}`);
      must(value.lead.intake_status === 'verified', `intake ${value.lead.intake_status}`);
      leadIds.push(value.lead.id);
      return `lead ${value.lead.id}, verified`;
    });

    await check('create second verified lead for real run', async () => {
      const { res, value } = await request('/api/leads', {
        method: 'POST',
        body: {
          name: `__smoke_run_lead_${suffix}__`,
          source: 'smoke-test: automated temporary record',
          verified: true,
          details: { services: ['Test Service'] },
          target_id: targetId,
        },
      });
      must(res.ok, value.error || `HTTP ${res.status}`);
      leadIds.push(value.lead.id);
      return `lead ${value.lead.id}`;
    });

    let site = null;
    let previewPath = '';
    await check('generate private site preview', async () => {
      const { res, value } = await request('/api/builder', {
        method: 'POST',
        body: { lead_id: leadIds[0] },
      });
      must(res.ok, value.error || `HTTP ${res.status}`);
      must(value.site.status === 'preview', `site status ${value.site.status}`);
      must(/token=/.test(value.site.previewUrl || ''), 'preview URL has no token');
      site = value.site;
      siteIds.push(site.id);
      previewPath = site.previewUrl;
      return `preview ${site.slug}`;
    });

    await check('private preview opens with token only', async () => {
      const { res, value } = await request(previewPath, { raw: true });
      must(res.ok, `HTTP ${res.status}`);
      must(/<!doctype html|<html/i.test(value), 'preview did not return HTML');
      return 'tokenized preview 200';
    });

    await check('public /site route hides unpublished preview', async () => {
      const { res } = await request(`/site/${encodeURIComponent(site.slug)}`);
      must(res.status === 404, `expected 404 before publish, got ${res.status}`);
      return '404 before publish';
    });

    let draft = null;
    await check('create grounded draft with working preview link', async () => {
      const { res, value } = await request('/api/outreach', {
        method: 'POST',
        body: { lead_id: leadIds[0] },
      });
      must(res.ok, value.error || `HTTP ${res.status}`);
      must(!value.outreach.sent_at, 'draft must not have sent_at');
      must(value.outreach.status === 'draft', `status ${value.outreach.status}`);
      must((value.outreach.body || '').includes('/api/site?slug='), 'draft body lacks tokenized preview link');
      must(!(value.outreach.body || '').includes(`/site/${site.slug}`), 'draft body contains dead public link');
      draft = value.outreach;
      draftIds.push(draft.id);
      return `draft ${draft.id}, step ${draft.sequence_step}`;
    });

    await check('review queue exposes tasks', async () => {
      const { res, value } = await request('/api/outreach/review');
      must(res.ok, value.error || `HTTP ${res.status}`);
      const tasks = value.queue || [];
      must(tasks.some((t) => t.ref_id === draft.id), 'new draft task missing from queue');
      return `${tasks.length} pending task(s)`;
    });

    await check('send cannot be confirmed before approval', async () => {
      const { res } = await request('/api/outreach/confirm-send', {
        method: 'POST',
        body: { id: draft.id, note: 'smoke' },
      });
      must(res.status === 400, `expected 400, got ${res.status}`);
      return '400 approval required';
    });

    await check('client cannot inject sent_at', async () => {
      const { res } = await request('/api/outreach/approve', {
        method: 'POST',
        body: { id: draft.id, sent_at: new Date().toISOString() },
      });
      must(res.status === 400, `expected 400, got ${res.status}`);
      return '400 forbidden field';
    });

    await check('human approves draft', async () => {
      const { res, value } = await request('/api/outreach/approve', {
        method: 'POST',
        body: { id: draft.id },
      });
      must(res.ok, value.error || `HTTP ${res.status}`);
      must(value.approval_status === 'approved', `approval ${value.approval_status}`);
      return 'approved, still unsent';
    });

    await check('human confirms manual send with real timestamp', async () => {
      const { res, value } = await request('/api/outreach/confirm-send', {
        method: 'POST',
        body: { id: draft.id, note: 'Smoke: user confirmed their own send' },
      });
      must(res.ok, value.error || `HTTP ${res.status}`);
      must(value.status === 'sent_by_user', `status ${value.status}`);
      must(!!value.sent_at, 'server did not set sent_at');
      return `status ${value.status}, sent_at set`;
    });

    await check('follow-up is a draft, not a send', async () => {
      const { res, value } = await request('/api/outreach/followup', {
        method: 'POST',
        body: { id: draft.id },
      });
      must(res.ok, value.error || `HTTP ${res.status}`);
      must(value.outreach.status === 'draft', `status ${value.outreach.status}`);
      must(Number(value.outreach.sequence_step) === 2, `step ${value.outreach.sequence_step}`);
      draftIds.push(value.outreach.id);
      return `step ${value.outreach.sequence_step} draft`;
    });

    await check('run performs real build/draft/review work', async () => {
      const { res, value } = await request('/api/runs', {
        method: 'POST',
        body: { target_id: targetId },
      });
      must(res.ok, value.error || `HTTP ${res.status}`);
      const result = value.run.result || {};
      must(Number(result.sitesGenerated) >= 1, `sitesGenerated ${result.sitesGenerated}`);
      must(Number(result.draftsCreated) >= 1, `draftsCreated ${result.draftsCreated}`);
      must(Number(result.reviewTasksQueued) >= 2, `reviewTasksQueued ${result.reviewTasksQueued}`);
      must(!value.run.phase || value.run.phase === 'done', `phase ${value.run.phase}`);
      return `sites ${result.sitesGenerated}, drafts ${result.draftsCreated}, reviews ${result.reviewTasksQueued}`;
    });

    await check('publish is explicit and sets server timestamp', async () => {
      const { res, value } = await request(`/api/sites/${site.id}`, {
        method: 'PATCH',
        body: { publish: true },
      });
      must(res.ok, value.error || `HTTP ${res.status}`);
      must(!!value.published_at, 'published_at not set by server');
      const pub = await request(`/site/${encodeURIComponent(site.slug)}`);
      must(pub.res.status === 200, `public route after publish ${pub.res.status}`);
      return 'published_at set; public route 200';
    });
  } finally {
    // Cleanup is best-effort; the records are labelled smoke tests either way.
    for (const id of draftIds) await request(`/api/outreach/${id}`, { method: 'DELETE' });
    for (const id of siteIds) await request(`/api/sites/${id}`, { method: 'DELETE' });
    for (const id of leadIds) await request(`/api/leads/${id}`, { method: 'DELETE' });
    if (targetCreated && targetId) await request(`/api/targets/${targetId}`, { method: 'DELETE' });
  }

  console.log(`\nSummary: ${passed} passed, ${failed} failed`);
  if (failed) process.exitCode = 1;
}

main().catch((err) => {
  console.error('Klaudius smoke crashed:', err && err.message ? err.message : err);
  process.exitCode = 1;
});
