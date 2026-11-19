/* Shared, honest site generator for Klaudius.
   Rule: only render details the caller actually supplied. No invented phone numbers,
   hours, addresses, photos or "real details" claims. */
'use strict';

function esc(t) {
  return String(t == null ? '' : t).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

const SYSTEMS = {
  editorial: { name: 'Editorial', fontDisplay: '"Space Grotesk", Inter, sans-serif', fontBody: 'Inter, system-ui, sans-serif', colorBg: '#F7F5F0', colorInk: '#0B0C10', colorAccent: '#C8A96B', colorSlate: '#6E8F8D' },
  modern:    { name: 'Modern',    fontDisplay: 'Inter, system-ui, sans-serif', fontBody: 'Inter, system-ui, sans-serif', colorBg: '#FFFFFF', colorInk: '#111827', colorAccent: '#2563EB', colorSlate: '#6B7280' },
  bold:      { name: 'Bold',      fontDisplay: '"Space Grotesk", Inter, sans-serif', fontBody: 'Inter, system-ui, sans-serif', colorBg: '#0B0C10', colorInk: '#F7F5F0', colorAccent: '#E4CE9A', colorSlate: '#9CA3AF' },
  warm:      { name: 'Warm',      fontDisplay: '"Space Grotesk", Inter, sans-serif', fontBody: 'Inter, system-ui, sans-serif', colorBg: '#FBF3E4', colorInk: '#4C2F1F', colorAccent: '#D97706', colorSlate: '#78350F' },
  cool:      { name: 'Cool',      fontDisplay: 'Inter, system-ui, sans-serif', fontBody: 'Inter, system-ui, sans-serif', colorBg: '#EFF6FF', colorInk: '#1E3A8A', colorAccent: '#3B82F6', colorSlate: '#1E40AF' },
};

function pickSystem(niche, requested) {
  if (requested && SYSTEMS[requested]) return SYSTEMS[requested];
  const n = String(niche || '').toLowerCase();
  if (/cafe|coffee|restaurant|bar|bakery|pizza|food/.test(n)) return SYSTEMS.editorial;
  if (/law|legal|account|financ|insurance|consult/.test(n)) return SYSTEMS.modern;
  if (/gym|fitness|crossfit|club|sport|training/.test(n)) return SYSTEMS.bold;
  if (/spa|salon|beauty|wellness|skin|nail|hair/.test(n)) return SYSTEMS.warm;
  if (/tech|software|agency|studio|digital|media/.test(n)) return SYSTEMS.cool;
  return SYSTEMS.editorial;
}

function list(items, cls) {
  const arr = Array.isArray(items) ? items.filter(Boolean) : [];
  if (!arr.length) return '';
  return `<ul class="${cls}">${arr.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`;
}

function buildSiteHtml(lead, opts) {
  opts = opts || {};
  const ds = pickSystem(lead.niche, opts.design);
  const name = String(lead.name || 'Business').trim();
  const niche = String(lead.niche || '').trim();
  const address = String(lead.address || '').trim();
  const phone = String(lead.phone || '').trim();
  const email = String(lead.email || lead.businessEmail || '').trim();
  const website = String(lead.website || '').trim();
  const about = String(lead.about || '').trim();
  const hours = String(lead.hours || '').trim();
  const photos = (Array.isArray(lead.photos) ? lead.photos : []).filter((u) => /^https?:\/\//i.test(u));
  const services = Array.isArray(lead.services) ? lead.services : [];
  const isSample = !!opts.sample;

  const hero = photos.length
    ? `<div class="hero photo" style="background-image:url('${esc(photos[0])}')"></div>`
    : `<div class="hero"><span>${esc(name.slice(0, 1).toUpperCase())}</span></div>`;
  const gallery = photos.length > 1
    ? `<div class="gallery">${photos.slice(1, 5).map((u) => `<div style="background-image:url('${esc(u)}')"></div>`).join('')}</div>`
    : '';

  const cta = [
    phone ? `<a class="btn" href="tel:${esc(phone.replace(/[^\d+]/g, ''))}">Call ${esc(phone)}</a>` : '',
    email ? `<a class="btn ghost" href="mailto:${esc(email)}">Email</a>` : '',
  ].filter(Boolean).join('');

  const aboutText = about ||
    `${name}${niche ? ` is a ${esc(niche).toLowerCase()}` : ' is a local business'}${address ? ` based in ${esc(address)}` : ''}. Add your own description in Klaudius to replace this text.`;

  const contactRows = [
    phone ? `<p><strong>Phone</strong><a href="tel:${esc(phone.replace(/[^\d+]/g, ''))}">${esc(phone)}</a></p>` : '',
    email ? `<p><strong>Email</strong><a href="mailto:${esc(email)}">${esc(email)}</a></p>` : '',
    address ? `<p><strong>Address</strong><span>${esc(address)}</span></p>` : '',
    hours ? `<p><strong>Hours</strong><span>${esc(hours)}</span></p>` : '',
    website ? `<p><strong>Website</strong><a href="${esc(website)}" target="_blank" rel="noopener">${esc(website)}</a></p>` : '',
  ].filter(Boolean).join('');

  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex,nofollow">
<title>${esc(name)}${niche ? ' — ' + esc(niche) : ''}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Inter:wght@400;500;700&display=swap" rel="stylesheet">
<style>
:root{--bg:${esc(ds.colorBg)};--ink:${esc(ds.colorInk)};--accent:${esc(ds.colorAccent)};--slate:${esc(ds.colorSlate)};--fd:${esc(ds.fontDisplay)};--fb:${esc(ds.fontBody)}}
*{box-sizing:border-box;margin:0;padding:0}html{scroll-behavior:smooth}
body{font-family:var(--fb);background:var(--bg);color:var(--ink);line-height:1.65;-webkit-font-smoothing:antialiased}
a{color:inherit;text-decoration:none}.wrap{max-width:980px;margin:0 auto;padding:0 22px}
.badge{display:inline-block;padding:6px 12px;border:1px solid var(--accent);color:var(--accent);font:600 10px/1 var(--fb);letter-spacing:.16em;text-transform:uppercase;border-radius:99px}
header{padding:34px 0 0}.top{display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap}
h1{font-family:var(--fd);font-size:clamp(30px,6vw,52px);line-height:1.08;letter-spacing:-.03em;margin:30px 0 10px}
.sub{color:var(--slate);font-size:clamp(14px,3vw,18px)}
.cta{display:flex;gap:10px;flex-wrap:wrap;margin:24px 0 6px}
.btn{display:inline-block;padding:13px 22px;background:var(--accent);color:var(--bg);font:700 12px/1 var(--fd);letter-spacing:.1em;text-transform:uppercase;border-radius:6px}
.btn.ghost{background:transparent;border:1px solid var(--accent);color:var(--accent)}
.hero{height:clamp(220px,46vw,380px);border-radius:18px;margin:26px 0;background:linear-gradient(135deg,var(--accent),var(--slate));display:grid;place-items:center;overflow:hidden}
.hero.photo{background-size:cover;background-position:center}
.hero span{font-family:var(--fd);font-size:96px;color:var(--bg);opacity:.85}
section{padding:26px 0 10px}h2{font-family:var(--fd);font-size:24px;margin-bottom:12px}
p{color:var(--slate);margin-bottom:12px}.services{list-style:none;display:grid;gap:8px;margin-top:14px}
.services li{padding:12px 16px;border:1px solid rgba(127,127,127,.28);border-radius:10px;font-weight:500}
.gallery{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-top:18px}
.gallery div{height:150px;border-radius:10px;background-size:cover;background-position:center}
.contact{display:grid;gap:10px;margin:20px 0 0;padding:22px;border:1px solid rgba(127,127,127,.25);border-radius:14px}
.contact p{display:flex;gap:14px;justify-content:space-between;color:var(--ink);font-size:14px;border-bottom:1px solid rgba(127,127,127,.14);padding-bottom:9px}
.contact strong{color:var(--slate);font-weight:500;flex:0 0 82px}
.contact a{text-decoration:underline;text-decoration-color:var(--accent);text-underline-offset:3px}
footer{margin-top:44px;padding:24px 0;border-top:1px solid rgba(127,127,127,.22);font-size:11px;color:var(--slate)}
@media(max-width:560px){.contact p{flex-direction:column;gap:2px}}
</style></head><body>
<div class="wrap">
<header><div class="top"><span class="badge">${isSample ? 'Sample preview' : 'Site preview'}</span><span style="font:600 11px var(--fd);letter-spacing:.12em">KLAUDIUS</span></div>
<h1>${esc(name)}${niche ? `<br><span style="color:var(--accent)">${esc(niche)}</span>` : ''}</h1>
${address ? `<p class="sub">${esc(address)}</p>` : ''}
${cta ? `<div class="cta">${cta}</div>` : ''}
${hero}</header>
<section><h2>About</h2><p>${esc(aboutText)}</p>
${list(services, 'services')}${gallery}</section>
${contactRows ? `<section><h2>Get in touch</h2><div class="contact">${contactRows}</div></section>` : ''}
<footer>Generated with Klaudius. ${isSample ? 'Sample data — replace with real business details before sharing.' : 'Preview only — confirm all details with the business before publishing.'}</footer>
</div></body></html>`;
}

module.exports = { SYSTEMS, pickSystem, buildSiteHtml, esc };
