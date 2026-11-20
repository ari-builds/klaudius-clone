// Shared Neon HTTP database helper (zero dependencies).
// Klaudius honesty-first personal tool — intake, previews, drafts, review.
// Uses Neon's SQL-over-HTTP API with the neon-connection-string header.
// Set DATABASE_URL in the environment (Vercel) or .env.local (local dev).
// Nothing here reads, logs or returns secrets.

const crypto = require('crypto');
const { buildSiteHtml, pickSystem, SYSTEMS } = require('../lib/site');

let _ctx = null;
let _ready = false;

function getCtx() {
  if (_ctx) return _ctx;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not configured');
  const u = new URL(url);
  _ctx = { endpoint: `https://${u.host}/sql`, url };
  return _ctx;
}

async function query(text, params = []) {
  const { endpoint, url } = getCtx();
  const r = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'neon-connection-string': url },
    body: JSON.stringify({ query: text, params }),
  });
  let j;
  try { j = await r.json(); } catch { throw new Error('DB returned non-JSON'); }
  if (j.error || !r.ok) {
    throw new Error(j.error?.message || j.message || `DB error ${r.status}`);
  }
  return j.rows || [];
}

// CREATE TABLE IF NOT EXISTS never changes an existing table, so migrations run
// after the bootstrap loop. Safe to repeat on every cold start.
async function ready() {
  if (_ready) return;
  const statements = [
    `CREATE TABLE IF NOT EXISTS users (
       id TEXT PRIMARY KEY,
       email TEXT UNIQUE NOT NULL,
       name TEXT NOT NULL DEFAULT '',
       plan TEXT NOT NULL DEFAULT 'starter',
       region TEXT NOT NULL DEFAULT '',
       status TEXT NOT NULL DEFAULT 'active',
       created_at TEXT NOT NULL,
       updated_at TEXT NOT NULL
     )`,
    `CREATE TABLE IF NOT EXISTS targets (
       id TEXT PRIMARY KEY,
       user_id TEXT NOT NULL,
       region TEXT NOT NULL,
       niche TEXT NOT NULL DEFAULT '',
       status TEXT NOT NULL DEFAULT 'active',
       businesses_found INTEGER NOT NULL DEFAULT 0,
       created_at TEXT NOT NULL,
       updated_at TEXT NOT NULL
     )`,
    `CREATE TABLE IF NOT EXISTS leads (
       id TEXT PRIMARY KEY,
       user_id TEXT NOT NULL,
       target_id TEXT NOT NULL DEFAULT '',
       name TEXT NOT NULL,
       website TEXT NOT NULL DEFAULT '',
       phone TEXT NOT NULL DEFAULT '',
       email TEXT NOT NULL DEFAULT '',
       address TEXT NOT NULL DEFAULT '',
       niche TEXT NOT NULL DEFAULT '',
       has_website INTEGER NOT NULL DEFAULT 0,
       status TEXT NOT NULL DEFAULT 'new',
       score INTEGER NOT NULL DEFAULT 0,
       photos JSONB NOT NULL DEFAULT '[]',
       details JSONB NOT NULL DEFAULT '{}',
       last_contacted_at TEXT,
       source TEXT NOT NULL DEFAULT '',
       source_url TEXT NOT NULL DEFAULT '',
       verified_at TEXT,
       intake_status TEXT NOT NULL DEFAULT 'unverified',
       score_basis TEXT NOT NULL DEFAULT '',
       created_at TEXT NOT NULL,
       updated_at TEXT NOT NULL
     )`,
    `CREATE TABLE IF NOT EXISTS lead_events (
       id TEXT PRIMARY KEY,
       lead_id TEXT NOT NULL,
       type TEXT NOT NULL,
       detail TEXT NOT NULL DEFAULT '',
       created_at TEXT NOT NULL
     )`,
    `CREATE TABLE IF NOT EXISTS sites (
       id TEXT PRIMARY KEY,
       user_id TEXT NOT NULL,
       lead_id TEXT NOT NULL,
       url TEXT NOT NULL,
       title TEXT NOT NULL DEFAULT '',
       design_system JSONB NOT NULL DEFAULT '{}',
       pages JSONB NOT NULL DEFAULT '[]',
       status TEXT NOT NULL DEFAULT 'draft',
       published_at TEXT,
       preview_token TEXT NOT NULL DEFAULT '',
       created_at TEXT NOT NULL,
       updated_at TEXT NOT NULL
     )`,
    `CREATE TABLE IF NOT EXISTS outreach (
       id TEXT PRIMARY KEY,
       user_id TEXT NOT NULL,
       lead_id TEXT NOT NULL,
       site_id TEXT NOT NULL DEFAULT '',
       channel TEXT NOT NULL DEFAULT 'email',
       sequence_step INTEGER NOT NULL DEFAULT 1,
       subject TEXT NOT NULL DEFAULT '',
       body TEXT NOT NULL DEFAULT '',
       status TEXT NOT NULL DEFAULT 'draft',
       approval_status TEXT NOT NULL DEFAULT 'pending',
       approved_at TEXT,
       approved_by TEXT NOT NULL DEFAULT '',
       source_snapshot JSONB NOT NULL DEFAULT '{}',
       next_follow_up_at TEXT,
       send_note TEXT NOT NULL DEFAULT '',
       sent_at TEXT,
       replied_at TEXT,
       reply_text TEXT NOT NULL DEFAULT '',
       created_at TEXT NOT NULL,
       updated_at TEXT NOT NULL
     )`,
    `CREATE TABLE IF NOT EXISTS review_tasks (
       id TEXT PRIMARY KEY,
       user_id TEXT NOT NULL,
       kind TEXT NOT NULL,
       ref_id TEXT NOT NULL DEFAULT '',
       lead_id TEXT NOT NULL DEFAULT '',
       site_id TEXT NOT NULL DEFAULT '',
       run_id TEXT NOT NULL DEFAULT '',
       status TEXT NOT NULL DEFAULT 'pending',
       note TEXT NOT NULL DEFAULT '',
       created_at TEXT NOT NULL,
       updated_at TEXT NOT NULL
     )`,
    `CREATE TABLE IF NOT EXISTS receptionists (
       id TEXT PRIMARY KEY,
       user_id TEXT NOT NULL,
       phone_number TEXT NOT NULL,
       voice TEXT NOT NULL DEFAULT 'alloy',
       greeting TEXT NOT NULL DEFAULT '',
       business_id TEXT NOT NULL DEFAULT '',
       status TEXT NOT NULL DEFAULT 'active',
       created_at TEXT NOT NULL,
       updated_at TEXT NOT NULL
     )`,
    `CREATE TABLE IF NOT EXISTS runs (
       id TEXT PRIMARY KEY,
       user_id TEXT NOT NULL,
       target_id TEXT NOT NULL,
       phase TEXT NOT NULL DEFAULT 'intake',
       status TEXT NOT NULL DEFAULT 'idle',
       progress INTEGER NOT NULL DEFAULT 0,
       result JSONB NOT NULL DEFAULT '{}',
       started_at TEXT,
       finished_at TEXT,
       created_at TEXT NOT NULL,
       updated_at TEXT NOT NULL
     )`,
  ];
  for (const stmt of statements) await query(stmt);

  const migrations = [
    'alter table leads add column if not exists source TEXT NOT NULL DEFAULT \'\'',
    'alter table leads add column if not exists source_url TEXT NOT NULL DEFAULT \'\'',
    'alter table leads add column if not exists verified_at TEXT',
    'alter table leads add column if not exists intake_status TEXT NOT NULL DEFAULT \'unverified\'',
    'alter table leads add column if not exists score_basis TEXT NOT NULL DEFAULT \'\'',
    'alter table sites add column if not exists preview_token TEXT NOT NULL DEFAULT \'\'',
    'alter table outreach add column if not exists site_id TEXT NOT NULL DEFAULT \'\'',
    'alter table outreach add column if not exists approval_status TEXT NOT NULL DEFAULT \'pending\'',
    'alter table outreach add column if not exists approved_at TEXT',
    'alter table outreach add column if not exists approved_by TEXT NOT NULL DEFAULT \'\'',
    'alter table outreach add column if not exists source_snapshot JSONB NOT NULL DEFAULT \'{}\'',
    'alter table outreach add column if not exists next_follow_up_at TEXT',
    'alter table outreach add column if not exists send_note TEXT NOT NULL DEFAULT \'\'',
    // Any pre-existing sample lead is never treated as a real, verified lead.
    `update leads set intake_status = 'sample', source = 'sample'
      where coalesce(details->>'sample', '') = 'true' and (source is null or source = '')`,
  ];
  for (const stmt of migrations) await query(stmt);
  _ready = true;
}

// Safely read JSONB that may arrive as a string, an object, or null.
function parseJson(value, fallback) {
  if (value == null) return fallback;
  if (typeof value === 'object') return value;
  if (typeof value !== 'string') return fallback;
  try {
    const parsed = JSON.parse(value);
    return parsed == null ? fallback : parsed;
  } catch {
    return fallback;
  }
}

// Derive the public site origin from the incoming request or the platform env.
// Never hard-code a personal domain. Falls back to local dev.
function baseUrl(req) {
  const clean = (s) => String(s || '').trim().replace(/\/+$/, '');
  const headers = (req && req.headers) || {};
  const rawHost = headers['x-forwarded-host'] || headers.host;
  if (rawHost) {
    const host = String(rawHost).split(',')[0].trim();
    const rawProto = headers['x-forwarded-proto'];
    const proto = clean(rawProto ? String(rawProto).split(',')[0] : (/^(localhost|127\.)/.test(host) ? 'http' : 'https'));
    return proto + '://' + host;
  }
  if (process.env.VERCEL_URL) return 'https://' + clean(process.env.VERCEL_URL);
  return 'http://localhost:3000';
}

function newId(prefix = '') {
  return prefix + Date.now().toString(36) + crypto.randomBytes(4).toString('hex');
}

// Best-effort audit trail. Never let a logging failure break the real action.
async function recordEvent(leadId, type, detail) {
  if (!leadId) return;
  try {
    await query(
      'insert into lead_events (id, lead_id, type, detail, created_at) values ($1,$2,$3,$4,$5)',
      [newId('evt_'), leadId, String(type || '').slice(0, 80), String(detail || '').slice(0, 500), new Date().toISOString()]
    );
  } catch {}
}

async function enqueueReview({ userId = 'demo-user', kind, refId = '', leadId = '', siteId = '', runId = '', note = '' } = {}) {
  const id = newId('rev_');
  const now = new Date().toISOString();
  await query(
    `insert into review_tasks (id, user_id, kind, ref_id, lead_id, site_id, run_id, status, note, created_at, updated_at)
     values ($1,$2,$3,$4,$5,$6,$7,'pending',$8,$9,$10)`,
    [id, userId, String(kind || 'review').slice(0, 60), String(refId || ''), String(leadId || ''),
     String(siteId || ''), String(runId || ''), String(note || '').slice(0, 500), now, now]
  );
  return id;
}

// Merge the JSON details column into the fields the site renderer understands.
function effectiveLead(lead) {
  const details = parseJson(lead.details, {});
  const photos = parseJson(lead.photos, []);
  return {
    ...lead,
    about: String(lead.about || details.about || '').trim(),
    hours: String(lead.hours || details.hours || '').trim(),
    services: Array.isArray(details.services) ? details.services
      : (Array.isArray(lead.services) ? lead.services : []),
    photos: Array.isArray(photos) ? photos : [],
    sample: !!lead.sample || !!details.sample,
  };
}

function siteSlug(name, id) {
  return String(name || 'business').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'business';
}

// A preview's stored URL (/site/<slug>) is not public until publishing. The only
// link that actually opens a private preview is the tokenized API route. Drafts
// and review screens must use this link or they will send a dead URL.
function siteLink(site) {
  if (!site) return '';
  const status = String(site.status || '');
  const token = site.preview_token || site.token || '';
  if (status === 'preview' && token) {
    const pages = parseJson(site.pages, []);
    const slug = site.slug || (Array.isArray(pages) && pages[0] && pages[0].slug) || '';
    if (slug) {
      return `/api/site?slug=${encodeURIComponent(slug)}&token=${encodeURIComponent(token)}`;
    }
  }
  return String(site.url || '');
}

// Every generated site starts as a private preview. Publishing is a separate,
// explicitly human action in /api/sites. The token guards the preview route.
async function createPreviewSite(lead, opts = {}) {
  const id = newId('site_');
  const now = new Date().toISOString();
  const view = effectiveLead(lead);
  const slug = `${siteSlug(view.name, id)}-${id.slice(-6)}`;
  const origin = opts.baseUrl || baseUrl(opts.req);
  const url = `${origin}/site/${slug}`;
  const token = crypto.randomBytes(12).toString('hex');
  const details = parseJson(lead.details, {});
  const design = String(opts.design || details.design || '').trim();
  const system = pickSystem(view.niche, design);
  const html = buildSiteHtml(view, { design, sample: opts.sample || view.sample });

  await query(
    `insert into sites (id, user_id, lead_id, url, title, design_system, pages, status, published_at, preview_token, created_at, updated_at)
     values ($1,$2,$3,$4,$5,$6,$7,'preview',null,$8,$9,$10)`,
    [id, opts.userId || 'demo-user', String(lead.id || ''), url, `${view.name} — Website`,
     JSON.stringify(system), JSON.stringify([{ slug, html }]), token, now, now]
  );
  await query('update leads set status = $1, updated_at = $2 where id = $3', ['site-built', now, String(lead.id || '')]);
  await recordEvent(lead.id, 'site_preview_generated', `Preview ${slug} created from supplied details; not published.`);
  return { id, url, slug, token, status: 'preview', design: system.name };
}

// A draft uses ONLY the lead name, the supplied services and the generated site
// URL. No phone, address, email, hours, photos, scores or invented claims.
async function createDraft({ lead, site, step = 1, userId = 'demo-user' } = {}) {
  if (!lead || !lead.id) throw new Error('A real lead is required for a draft');
  if (!site || !site.url) throw new Error('A generated site URL is required for a draft');
  const name = String(lead.name || '').trim();
  if (!name) throw new Error('Lead name is required for a draft');
  const details = parseJson(lead.details, {});
  const services = (Array.isArray(details.services) ? details.services : [])
    .filter(Boolean).map((s) => String(s).trim()).filter(Boolean).slice(0, 8);
  const siteUrl = siteLink(site);
  if (!siteUrl) throw new Error('A usable generated site URL is required for a draft');
  const sequence = Math.max(1, Math.min(5, Number(step) || 1));

  const serviceLine = services.length ? ` for ${services.join(', ').toLowerCase()}` : '';
  const subject = sequence === 1
    ? `A website preview for ${name}`
    : `Follow-up ${sequence - 1} — ${name} preview`;
  const body = sequence === 1
    ? `Hi ${name},\n\nI prepared a one-page website preview${serviceLine}. You can view it here:\n${siteUrl}\n\nThis is a preview only — nothing has been published and nothing has been sent on your behalf. Please review the details before we continue.\n\nThanks,\nArian`
    : `Hi ${name},\n\nFollowing up on the website preview${serviceLine}. It is still a preview: ${siteUrl}\n\nNothing has been published. Let me know if you would like me to proceed.\n\nThanks,\nArian`;

  const snapshot = {
    basis: 'lead.name + lead.details.services + site.url',
    fields: ['name', 'services', 'siteUrl'],
    lead: { id: String(lead.id), name },
    services,
    site: { id: String(site.id || ''), url: siteUrl, status: site.status || 'preview' },
    generated_at: new Date().toISOString(),
  };

  const id = newId('out_');
  const now = new Date().toISOString();
  await query(
    `insert into outreach (id, user_id, lead_id, site_id, channel, sequence_step, subject, body, status,
       approval_status, source_snapshot, created_at, updated_at)
     values ($1,$2,$3,$4,'email',$5,$6,$7,'draft','pending',$8,$9,$10)`,
    [id, userId, String(lead.id), String(site.id || ''), sequence, subject, body,
     JSON.stringify(snapshot), now, now]
  );
  await recordEvent(lead.id, 'pitch_draft_prepared', `Draft ${id} from name/services/site URL only; not sent.`);
  return { id, lead_id: String(lead.id), site_id: String(site.id || ''), sequence_step: sequence, subject, body, status: 'draft', approval_status: 'pending' };
}

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.end(JSON.stringify(body));
}

function cors(req, res) {
  if (req.method === 'OPTIONS') {
    json(res, 204, { ok: true });
    return true;
  }
  return false;
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => { data += chunk; });
    req.on('end', () => {
      try { resolve(JSON.parse(data || '{}')); } catch (e) { reject(new Error('invalid json')); }
    });
    req.on('error', reject);
  });
}

module.exports = {
  query, ready, newId, json, cors, parseBody,
  parseJson, baseUrl, siteLink, recordEvent, enqueueReview, effectiveLead,
  createPreviewSite, createDraft,
};
