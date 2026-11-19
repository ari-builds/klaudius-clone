// Website builder — generates bespoke HTML sites for leads (core klaudius feature).
const db = require('./_db');

const DESIGN_SYSTEMS = {
  editorial: {
    name: 'Editorial',
    fontDisplay: '"Space Grotesk", Inter, sans-serif',
    fontBody: 'Inter, system-ui, sans-serif',
    colorBg: '#F7F5F0',
    colorInk: '#0B0C10',
    colorAccent: '#C8A96B',
    colorSlate: '#6E8F8D',
  },
  modern: {
    name: 'Modern',
    fontDisplay: '"Inter", system-ui, sans-serif',
    fontBody: 'Inter, system-ui, sans-serif',
    colorBg: '#FFFFFF',
    colorInk: '#111827',
    colorAccent: '#2563EB',
    colorSlate: '#6B7280',
  },
  bold: {
    name: 'Bold',
    fontDisplay: '"Space Grotesk", Inter, sans-serif',
    fontBody: 'Inter, system-ui, sans-serif',
    colorBg: '#0B0C10',
    colorInk: '#F7F5F0',
    colorAccent: '#E4CE9A',
    colorSlate: '#9CA3AF',
  },
  warm: {
    name: 'Warm',
    fontDisplay: '"Space Grotesk", Inter, sans-serif',
    fontBody: 'Inter, system-ui, sans-serif',
    colorBg: '#FBF3E4',
    colorInk: '#4C2F1F',
    colorAccent: '#D97706',
    colorSlate: '#78350F',
  },
  cool: {
    name: 'Cool',
    fontDisplay: '"Inter", system-ui, sans-serif',
    fontBody: 'Inter, system-ui, sans-serif',
    colorBg: '#EFF6FF',
    colorInk: '#1E3A8A',
    colorAccent: '#3B82F6',
    colorSlate: '#1E40AF',
  },
};

function pickSystem(niche) {
  const n = (niche || '').toLowerCase();
  if (n.includes('cafe') || n.includes('restaurant') || n.includes('bar')) return DESIGN_SYSTEMS.editorial;
  if (n.includes('law') || n.includes('legal') || n.includes('account')) return DESIGN_SYSTEMS.modern;
  if (n.includes('gym') || n.includes('fitness') || n.includes('club')) return DESIGN_SYSTEMS.bold;
  if (n.includes('spa') || n.includes('salon') || n.includes('wellness')) return DESIGN_SYSTEMS.warm;
  if (n.includes('tech') || n.includes('software') || n.includes('agency')) return DESIGN_SYSTEMS.cool;
  return DESIGN_SYSTEMS.editorial;
}

function buildHtml(lead, ds) {
  const title = `${lead.name} — ${lead.niche || 'Business'} — ${lead.address || 'Local'}`;
  const phones = lead.phone || '(555) 000-0000';
  const emails = lead.email || 'hello@example.com';
  const address = lead.address || '123 Main Street';
  const website = lead.website || '#';
  const images = Array.isArray(lead.photos) && lead.photos.length ? lead.photos : ['https://images.unsplash.com/photo-1497366216548-37526070297c?w=800&q=80'];
  const heroImg = images[0];
  const galleryImg = images.slice(1, 4).map((u) => `<div class="gal-img" style="background-image:url('${escapeHtml(u)}')"></div>`).join('') || `<div class="gal-img" style="background-image:url('${escapeHtml(heroImg)}')"></div>`;
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${escapeHtml(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=${encodeURIComponent(ds.fontDisplay)}&family=${encodeURIComponent(ds.fontBody)}&display=swap" rel="stylesheet">
<style>
  :root{--bg:${ds.colorBg};--ink:${ds.colorInk};--accent:${ds.colorAccent};--slate:${ds.colorSlate};--fd:${ds.fontDisplay};--fb:${ds.fontBody}}
  *{box-sizing:border-box;margin:0;padding:0}html{scroll-behavior:smooth}
  body{font-family:var(--fb);background:var(--bg);color:var(--ink);line-height:1.6}
  a{color:var(--ink);text-decoration:none}
  .container{max-width:900px;margin:0 auto;padding:0 20px}
  header{padding:40px 20px;text-align:center}
  h1{font-family:var(--fd);font-size:40px;font-weight:800;letter-spacing:-0.02em;margin-bottom:8px}
  .sub{color:var(--slate);font-size:17px}
  .accent{color:var(--accent)}
  .btn{display:inline-block;margin-top:22px;padding:14px 28px;background:var(--accent);color:var(--ink);font-family:var(--fd);font-weight:700;font-size:13px;letter-spacing:0.14em;text-transform:uppercase;border-radius:6px;text-decoration:none}
  .hero-img{width:100%;height:320px;background-image:url('${escapeHtml(heroImg)}');background-size:cover;background-position:center;border-radius:16px;margin:24px 0}
  h2{font-family:var(--fd);font-size:26px;margin:40px 0 14px}
  p{color:var(--slate);margin-bottom:16px;font-size:15px}
  .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px;margin:30px 0}
  .card{background:#fff;border:1px solid rgba(0,0,0,.08);border-radius:12px;padding:20px}
  .card h3{font-family:var(--fd);font-size:16px;margin-bottom:8px}
  .contact{margin-top:50px;padding:30px;background:rgba(0,0,0,.02);border-radius:16px}
  .contact p{margin-bottom:6px;font-size:14px}
  footer{margin-top:60px;padding:30px 0;border-top:1px solid rgba(0,0,0,.08);font-size:12px;color:var(--slate);text-align:center}
  .gallery{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:30px 0}
  .gal-img{height:140px;background-size:cover;background-position:center;border-radius:8px}
  @media (max-width:640px){h1{font-size:28px}.grid{grid-template-columns:1fr}.gallery{grid-template-columns:1fr}}
</style></head><body>
<header><div class="container"><h1>${escapeHtml(lead.name)}<span class="accent"> · ${escapeHtml(lead.niche || 'Business')}</span></h1><p class="sub">${escapeHtml(lead.address)}</p><a href="${escapeHtml(website)}" class="btn">Visit website</a></div><div class="hero-img"></div></header>
<div class="container"><h2>About</h2><p>A bespoke website built for ${escapeHtml(lead.name)} — ${escapeHtml(lead.niche || 'a local business')} serving ${escapeHtml(lead.address)}. Real photos, real details, no template.</p>
<div class="gallery">${galleryImg}</div>
<div class="grid"><div class="card"><h3>Get in touch</h3><p>Phone: <a href="tel:${escapeHtml(phones)}">${escapeHtml(phones)}</a></p><p>Email: <a href="mailto:${escapeHtml(emails)}">${escapeHtml(emails)}</a></p><p>Address: ${escapeHtml(address)}</p></div><div class="card"><h3>Hours</h3><p>Mon–Fri: 9am–6pm</p><p>Sat: 10am–4pm</p><p>Sun: Closed</p></div></div>
<div class="contact"><h2>Contact ${escapeHtml(lead.name)}</h2><p>Ready to grow online? ${escapeHtml(lead.name)} is ready to help.</p><p><strong>Phone:</strong> ${escapeHtml(phones)}</p><p><strong>Email:</strong> ${escapeHtml(emails)}</p><p><strong>Address:</strong> ${escapeHtml(address)}</p></div></div>
<footer><div class="container">Built by Klaudius · Bespoke websites for local businesses</div></footer>
</body></html>`;
}

function escapeHtml(t){ return String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;" })[c]); }

module.exports = async (req, res) => {
  if (db.cors(req, res)) return;
  const path = req.url.split('?')[0];
  const m = path.match(/^\/api\/builder\/([^/]+)$/);

  try { await db.ready(); } catch (e) {
    return db.json(res, 500, { error: 'Database unavailable' });
  }

  if (path === '/api/builder' && req.method === 'POST') {
    const body = await db.parseBody(req);
    const leadId = body.lead_id;
    if (!leadId) return db.json(res, 400, { error: 'lead_id required' });

    const leadRows = await db.query('select * from leads where id = $1', [leadId]);
    if (!leadRows.length) return db.json(res, 404, { error: 'lead not found' });
    const lead = leadRows[0];

    const ds = pickSystem(lead.niche);
    const html = buildHtml(lead, ds);
    const id = db.newId('site_');
    const now = new Date().toISOString();
    const slug = `${lead.name.toLowerCase().replace(/[^a-z0-9]+/g,'-')}-${id.slice(-6)}`;
    const url = `https://klaudius-clone.vercel.app/site/${slug}`;

    await db.query(
      `insert into sites (id, user_id, lead_id, url, title, design_system, pages, status, published_at, created_at, updated_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [id, 'demo-user', leadId, url, `${lead.name} — Website`, JSON.stringify(ds), JSON.stringify([{ slug, html }]), 'published', now, now, now]
    );
    await db.query('update leads set status = $1 where id = $2', ['site-built', leadId]);

    return db.json(res, 201, { ok: true, site: { id, url, slug, status: 'published' }, html });
  }

  if (m && req.method === 'GET') {
    const { sites = [] } = await db.query('select * from sites where id = $1', [m[1]]);
    if (!sites.length) return db.json(res, 404, { error: 'site not found' });
    return db.json(res, 200, { ok: true, site: sites[0] });
  }

  return db.json(res, 404, { error: 'not found' });
};
