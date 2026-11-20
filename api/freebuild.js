// Free build — turn REAL business details the user supplies into a private preview.
// No invented contact data. No email is sent or claimed. A region-only call
// produces a clearly-labelled sample, never a real lead.
const db = require('./_db');

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
  const now = new Date().toISOString();
  const details = {
    region,
    sample: !hasRealData,
    about: leadData.about || '',
    hours: leadData.hours || '',
    services: leadData.services || [],
    design: String(body.design || '').trim(),
  };
  const source = hasRealData ? 'user-supplied form' : 'sample';
  const intakeStatus = hasRealData ? 'verified' : 'sample';

  await db.query('insert into targets (id, user_id, region, niche, status, businesses_found, created_at, updated_at) values ($1,$2,$3,$4,$5,$6,$7,$8)',
    [targetId, 'demo-user', region || leadData.address || 'Manual', leadData.niche || 'local business', 'active', hasRealData ? 0 : 1, now, now]);

  await db.query(`insert into leads (id, user_id, target_id, name, website, phone, email, address, niche, has_website,
      status, score, photos, details, last_contacted_at, source, source_url, verified_at, intake_status, score_basis, created_at, updated_at)
     values ($1,'demo-user',$2,$3,$4,$5,$6,$7,$8,$9,'new',0,$10,$11,null,$12,$13,$14,$15,'',$16,$17)`,
    [leadId, targetId, leadData.name, leadData.website || '', leadData.phone || '', leadData.email || '',
     leadData.address || '', leadData.niche || '', leadData.website ? 1 : 0, JSON.stringify(leadData.photos || []),
     JSON.stringify(details), source, '', hasRealData ? now : null, intakeStatus, now, now]);

  await db.recordEvent(leadId, 'intake', `Source: ${source}. Intake: ${intakeStatus}. No score assigned.`);

  const site = await db.createPreviewSite(
    { ...leadData, id: leadId, details },
    { req, design: details.design, sample: !hasRealData }
  );

  return db.json(res, 201, {
    ok: true,
    region,
    business: leadData.name,
    siteUrl: site.url,
    previewUrl: `/api/site?slug=${encodeURIComponent(site.slug)}&token=${encodeURIComponent(site.token)}`,
    sample: !hasRealData,
    note: hasRealData
      ? 'Private preview created from the details you entered. Not published; no email was sent.'
      : 'Sample preview only. Add real business details to build a genuine preview.',
  });
};
