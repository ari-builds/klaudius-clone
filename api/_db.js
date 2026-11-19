// Shared Neon HTTP database helper (zero dependencies).
// Klaudius autonomous agency platform — CRM, sites, runs, outreach, receptionist.
// Uses Neon's SQL-over-HTTP API with the neon-connection-string header.
// Set DATABASE_URL in the environment (Vercel) or .env.local (local dev).

const crypto = require('crypto');

let _ctx = null;

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

async function ready() {
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
       created_at TEXT NOT NULL,
       updated_at TEXT NOT NULL
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
       created_at TEXT NOT NULL,
       updated_at TEXT NOT NULL
     )`,
    `CREATE TABLE IF NOT EXISTS outreach (
       id TEXT PRIMARY KEY,
       user_id TEXT NOT NULL,
       lead_id TEXT NOT NULL,
       channel TEXT NOT NULL DEFAULT 'email',
       sequence_step INTEGER NOT NULL DEFAULT 1,
       subject TEXT NOT NULL DEFAULT '',
       body TEXT NOT NULL DEFAULT '',
       status TEXT NOT NULL DEFAULT 'pending',
       sent_at TEXT,
       replied_at TEXT,
       reply_text TEXT NOT NULL DEFAULT '',
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
       phase TEXT NOT NULL DEFAULT 'find',
       status TEXT NOT NULL DEFAULT 'idle',
       progress INTEGER NOT NULL DEFAULT 0,
       result JSONB NOT NULL DEFAULT '{}',
       started_at TEXT,
       finished_at TEXT,
       created_at TEXT NOT NULL,
       updated_at TEXT NOT NULL
     )`
  ];
  for (const stmt of statements) await query(stmt);
}

function newId(prefix = '') {
  return prefix + Date.now().toString(36) + crypto.randomBytes(4).toString('hex');
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

module.exports = { query, ready, newId, json, cors, parseBody };
