// Free build — turn REAL business details the user supplies into a published preview site.
// No invented contact data. No email is sent and none is claimed. A region-only call
// produces a clearly-labelled sample so the tool remains honest.
const db = require('./_db');
const { buildSiteHtml, SYSTEMS } = require('../lib/site');

const SAMPLES = {
  cork:      { name: 'Fennel & Fig Cafe', niche: 'cafe', address: 'Oliver Plunkett St, Cork', phone: '', email: '', website: '', photos: [], region: 'Cork, Ireland' },
  austin:    { name: 'Hidamari Matcha', niche: 'cafe', address: 'South Congress, Austin TX', phone: '', email: '', website: '', photos: [], region: 'Austin, TX' },
  harrogate: { name: 'Beckwith Aesthetics', niche: 'aesthetics studio', address: 'Crescent Road, Harrogate', phone: '', email: '', website: '', photos: [], region: 'Harrogate, UK' },
  cambridge: { name: 'Hartford Electrical', niche: 'electrician', address: 'Mill Road, Cambridge', phone: '', email: '', website: '', photos: [], region: 'Cambridge, UK' },
};

function sampleFor(region) {
  const r = String(region || '').toLowerCase();
  const key = Object.keys(SAMPLES).find((k) => r.includes(k));
  if (!key) return { name: `${region || 'Local'} Business`, niche: 'local business', address: region || '', phone: '', email: '', website: '', photos: [], region: region || '' };
  return { ...SAMPLES[key] };
}

module.exports = async (req, res) => {
  if (db.cors(req, res)) return;
  if (req.method !== 'POST') return db.json(res, 405, { error: 'method not allowed' });

  try { await db.ready(); } catch (e) {
    return db.json(res, 500, { error: 'Database unavailable' });
  }

  let body;
  try { body = await db.parseBody(req); } catch { return db.json(res, 400, { error: 'Invalid request body' }); }

  const region = String(body.region || '').trim();
  const name = String(body.name || '').trim();
  const hasRealData = !!name;
  if (!region && !hasRealData) return db.json(res, 400, { error: 'Enter a business name, or a region for a sample preview.' });

  const leadData = hasRealData ? {
    name,
    niche: String(body.niche || '').trim(),
    address: String(body.address || region).trim(),
    phone: String(body.phone || '').trim(),
    email: String(body.email || '').trim(),
    website: String(body.website || '').trim(),
    about: String(body.about || '').trim(),
    hours: String(body.hours || '').trim(),
    services: Array.isArray(body.services) ? body.services.filter(Boolean).map(String).slice(0, 12) : [],
    photos: Array.isArray(body.photos) ? body.photos.filter((u) => /^https?:\/\//i.test(String(u))).slice(0, 6) : [],
    region,
  } : sampleFor(region);

  const targetId = db.newId('target_');
  const leadId = db.newId('lead_');
  const siteId = db.newId('site_');
  const now = new Date().toISOString();
  const details = {
    region,
    sample: !hasRealData,
    about: leadData.about || '',
    hours: leadData.hours || '',
    services: leadData.services || [],
    design: String(body.design || '').trim(),
  };

  await db.query('insert into targets (id, user_id, region, niche, status, businesses_found, created_at, updated_at) values ($1,$2,$3,$4,$5,$6,$7,$8)',
    [targetId, 'demo-user', region || leadData.address || 'Manual', leadData.niche || 'local business', 'active', 1, now, now]);

  await db.query(`insert into leads (id, user_id, target_id, name, website, phone, email, address, niche, has_website, status, score, photos, details, last_contacted_at, created_at, updated_at)
   values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
    [leadId, 'demo-user', targetId, leadData.name, leadData.website || '', leadData.phone || '', leadData.email || '', leadData.address || '', leadData.niche || '',
     leadData.website ? 1 : 0, 'site-built', hasRealData ? 100 : 0, JSON.stringify(leadData.photos || []), JSON.stringify(details), null, now, now]);

  const html = buildSiteHtml(leadData, { sample: !hasRealData, design: details.design });
  const slug = `${leadData.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'business'}-${siteId.slice(-6)}`;
  const url = `https://klaudius-clone.vercel.app/site/${slug}`;

  await db.query(`insert into sites (id, user_id, lead_id, url, title, design_system, pages, status, published_at, created_at, updated_at)
   values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [siteId, 'demo-user', leadId, url, `${leadData.name} — Website`, JSON.stringify(SYSTEMS[details.design] || {}), JSON.stringify([{ slug, html }]), 'published', now, now, now]);

  return db.json(res, 201, {
    ok: true,
    region,
    business: leadData.name,
    siteUrl: url,
    sample: !hasRealData,
    note: hasRealData
      ? 'Preview created from the details you entered. No email was sent.'
      : 'Sample preview only. Add real business details to build a genuine site.',
  });
};
