/* Klaudius dashboard SPA — autonomous AI agency platform.
   Vanilla JS, zero build step. Calls the /api/* serverless functions. */
'use strict';

const BASE = '';
const userId = 'demo-user';

const els = {};
function $ (id){ return document.getElementById(id); }

const SECTIONS = ['dashboard','targets','leads','sites','outreach','receptionist','runs','settings'];

async function api(path, { method='GET', body } = {}){
  const headers = { 'Content-Type': 'application/json' };
  const opts = { method, headers };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const r = await fetch(BASE + path, opts);
  if (!r.ok) throw new Error(`API ${r.status}`);
  return r.json();
}

function showSection(name){
  SECTIONS.forEach(s => { $(`section-${s}`).style.display = (s === name) ? '' : 'none'; });
  document.querySelectorAll('.nav-item').forEach(a => {
    a.classList.toggle('active', a.dataset.section === name);
  });
  $('topSection').textContent = name.charAt(0).toUpperCase() + name.slice(1);
  const subs = { dashboard:'Your agency at a glance', targets:'Regions to scan', leads:'CRM — businesses found', sites:'Bespoke sites published', outreach:'Pitch sequences', receptionist:'AI phone numbers', runs:'Autonomous pipeline', settings:'Profile & plan' };
  $('topSub').textContent = subs[name] || '';
  window.scrollTo({ top: 0 });
  if (name === 'dashboard') loadDashboard();
  else if (name === 'targets') loadTargets();
  else if (name === 'leads') loadLeads();
  else if (name === 'sites') loadSites();
  else if (name === 'outreach') loadOutreach();
  else if (name === 'receptionist') loadReceptionist();
  else if (name === 'runs') loadRuns();
  else if (name === 'settings') loadSettings();
}

async function loadUser(){
  try {
    const { user } = await api('/api/auth/me');
    $('sideUser').textContent = user.name || 'Founder';
    $('setName').value = user.name || '';
    $('setRegion').value = user.region || '';
    $('setPlan').value = user.plan || 'starter';
  } catch (e) {
    $('sideUser').textContent = 'Founder';
  }
}

async function loadDashboard(){
  try {
    const [leadsRes, sitesRes, outRes] = await Promise.all([
      api('/api/leads'), api('/api/sites'), api('/api/outreach')
    ]);
    const leads = leadsRes.leads || [];
    const sites = sitesRes.sites || [];
    const out = outRes.outreach || [];
    $('statLeads').textContent = leads.length;
    $('statSites').textContent = sites.length;
    $('statSent').textContent = out.filter(o => o.status === 'sent').length;
    $('statReplies').textContent = out.filter(o => o.status === 'replied').length;
    const activity = [];
    leads.slice(0, 3).forEach(l => activity.push({ m: `New lead: ${l.name}`, d: l.niche || '—', t: l.created_at }));
    sites.slice(0, 3).forEach(s => activity.push({ m: `Site published: ${s.title || s.url}`, d: s.status, t: s.created_at }));
    const list = $('activityList');
    list.innerHTML = '';
    if (activity.length === 0) {
      list.innerHTML = '<div class="act-item"><div class="act-m">No activity yet</div><div class="act-d">Start your first run to see activity here.</div></div>';
    } else {
      activity.forEach(a => {
        list.innerHTML += `<div class="act-item"><div class="act-m">${escapeHtml(a.m)}</div><div class="act-d">${escapeHtml(a.d)}</div></div>`;
      });
    }
  } catch (e) {
    console.error(e);
  }
}

async function loadTargets(){
  try {
    const { targets = [] } = await api('/api/targets');
    const wrap = $('targetsTable');
    wrap.innerHTML = '';
    if (targets.length === 0) { wrap.innerHTML = '<div class="empty">No targets yet. Add your first region below.</div>'; return; }
    wrap.innerHTML = `<table><thead><tr><th>Region</th><th>Niche</th><th>Status</th><th>Found</th><th>Actions</th></tr></thead><tbody>${targets.map(t => `
      <tr><td><strong>${escapeHtml(t.region)}</strong></td><td>${escapeHtml(t.niche || '—')}</td><td><span class="badge badge-${t.status}">${t.status}</span></td><td>${t.businesses_found || 0}</td><td>
        <button class="btn-sm" onclick="appDeleteTarget('${t.id}')">Delete</button>
      </td></tr>`).join('')}</tbody></table>`;
  } catch (e) { console.error(e); }
}

async function loadLeads(){
  try {
    const status = $('leadStatus').value;
    const url = status ? `/api/leads?status=${encodeURIComponent(status)}` : '/api/leads';
    const { leads = [] } = await api(url);
    const q = $('leadSearch').value.toLowerCase();
    const filtered = q ? leads.filter(l => (l.name||'').toLowerCase().includes(q) || (l.website||'').toLowerCase().includes(q) || (l.niche||'').toLowerCase().includes(q)) : leads;
    const wrap = $('leadsTable');
    wrap.innerHTML = '';
    if (filtered.length === 0) { wrap.innerHTML = '<div class="empty">No leads match.</div>'; return; }
    wrap.innerHTML = `<table><thead><tr><th>Business</th><th>Website</th><th>Niche</th><th>Score</th><th>Status</th><th>Actions</th></tr></thead><tbody>${filtered.map(l => `
      <tr><td><strong>${escapeHtml(l.name)}</strong></td><td>${escapeHtml(l.website || '—')}</td><td>${escapeHtml(l.niche || '—')}</td><td>${l.score || 0}</td><td><span class="badge badge-${l.status}">${l.status}</span></td><td>
        <button class="btn-sm" onclick="appPitchLead('${l.id}','${escapeHtml(l.name)}')">Pitch</button>
        ${l.status !== 'site-built' && l.status !== 'published' ? `<button class="btn-sm" onclick="appBuildSite('${l.id}','${escapeHtml(l.name)}')">Build site</button>` : ''}
        <button class="btn-sm danger" onclick="appDeleteLead('${l.id}')">Delete</button>
      </td></tr>`).join('')}</tbody></table>`;
    $('leadStatus').onchange = loadLeads;
    $('leadSearch').oninput = loadLeads;
  } catch (e) { console.error(e); }
}

async function loadSites(){
  try {
    const { sites = [] } = await api('/api/sites');
    const wrap = $('sitesTable');
    wrap.innerHTML = '';
    if (sites.length === 0) { wrap.innerHTML = '<div class="empty">No sites built yet. Start a run to build sites.</div>'; return; }
    wrap.innerHTML = `<table><thead><tr><th>Title</th><th>URL</th><th>Status</th><th>Published</th><th>Actions</th></tr></thead><tbody>${sites.map(s => `
      <tr><td><strong>${escapeHtml(s.title || s.url)}</strong></td><td>${escapeHtml(s.url)}</td><td><span class="badge badge-${s.status}">${s.status}</span></td><td>${s.published_at ? new Date(s.published_at).toLocaleDateString() : '—'}</td><td>
        <a href="${s.url}" class="btn-sm" target="_blank" rel="noopener">Open</a>
      </td></tr>`).join('')}</tbody></table>`;
  } catch (e) { console.error(e); }
}

async function loadOutreach(){
  try {
    const { outreach = [] } = await api('/api/outreach');
    const wrap = $('outreachTable');
    wrap.innerHTML = '';
    if (outreach.length === 0) { wrap.innerHTML = '<div class="empty">No outreach yet. Pitch a lead to start.</div>'; return; }
    wrap.innerHTML = `<table><thead><tr><th>Lead</th><th>Channel</th><th>Step</th><th>Subject</th><th>Status</th><th>Actions</th></tr></thead><tbody>${outreach.map(o => `
      <tr><td>${escapeHtml(o.lead_id)}</td><td>${o.channel}</td><td>${o.sequence_step}</td><td>${escapeHtml(o.subject || '—')}</td><td><span class="badge badge-${o.status}">${o.status}</span></td><td>
        <button class="btn-sm" onclick="appMarkSent('${o.id}')">Mark sent</button>
      </td></tr>`).join('')}</tbody></table>`;
  } catch (e) { console.error(e); }
}

async function loadReceptionist(){
  try {
    const { receptionists = [] } = await api('/api/receptionists');
    const wrap = $('receptionistTable');
    wrap.innerHTML = '';
    if (receptionists.length === 0) { wrap.innerHTML = '<div class="empty">No receptionist numbers yet. Add one below.</div>'; return; }
    wrap.innerHTML = `<table><thead><tr><th>Phone number</th><th>Voice</th><th>Status</th><th>Actions</th></tr></thead><tbody>${receptionists.map(r => `
      <tr><td><strong>${escapeHtml(r.phone_number)}</strong></td><td>${escapeHtml(r.voice || 'alloy')}</td><td><span class="badge badge-${r.status}">${r.status}</span></td><td>
        <button class="btn-sm danger" onclick="appDeleteRec('${r.id}')">Delete</button>
      </td></tr>`).join('')}</tbody></table>`;
  } catch (e) { console.error(e); }
}

async function loadRuns(){
  try {
    const { runs = [] } = await api('/api/runs');
    const wrap = $('runsTable');
    wrap.innerHTML = '';
    if (runs.length === 0) { wrap.innerHTML = '<div class="empty">No runs yet. Start your first autonomous run.</div>'; return; }
    wrap.innerHTML = `<table><thead><tr><th>Target</th><th>Phase</th><th>Status</th><th>Progress</th><th>Actions</th></tr></thead><tbody>${runs.map(r => `
      <tr><td>${escapeHtml(r.target_id)}</td><td>${r.phase}</td><td><span class="badge badge-${r.status}">${r.status}</span></td><td>${r.progress}%</td><td>
        <button class="btn-sm" onclick="appRunProgress('${r.id}')">Progress</button>
        <button class="btn-sm danger" onclick="appDeleteRun('${r.id}')">Delete</button>
      </td></tr>`).join('')}</tbody></table>`;
  } catch (e) { console.error(e); }
}

async function loadSettings(){
  await loadUser();
}

// ---- Actions ----

window.appAddTarget = async () => {
  const region = $('tgtRegion').value.trim();
  const niche = $('tgtNiche').value.trim();
  if (!region) return alert('Enter a region');
  try {
    await api('/api/targets', { method: 'POST', body: { region, niche } });
    $('tgtRegion').value = ''; $('tgtNiche').value = '';
    loadTargets();
  } catch (e) { alert('Failed to add target'); }
};

window.appDeleteTarget = async (id) => {
  if (!confirm('Delete this target?')) return;
  await api(`/api/targets/${id}`, { method: 'DELETE' });
  loadTargets();
};

window.appPitchLead = async (id, name) => {
  if (!confirm(`Send a personalised pitch to ${name}?`)) return;
  try {
    await api('/api/outreach', { method: 'POST', body: { lead_id: id, channel: 'email', sequence_step: 1, subject: `Here's a website I built for ${name}`, body: `Hi ${name}, I built a bespoke website for your business using your own photos and details. Want to keep it?` } });
    loadOutreach();
    await api(`/api/leads/${id}`, { method: 'PATCH', body: { status: 'pitched', last_contacted_at: new Date().toISOString() } });
    loadLeads();
  } catch (e) { alert('Failed to send pitch'); }
};

window.appBuildSite = async (id, name) => {
  if (!confirm(`Build a bespoke website for ${name}?`)) return;
  try {
    const result = await api('/api/builder', { method: 'POST', body: { lead_id: id } });
    await api(`/api/leads/${id}`, { method: 'PATCH', body: { status: 'site-built', last_contacted_at: new Date().toISOString() } });
    loadLeads();
    loadSites();
    alert(`Site built: ${result.site.url}`);
  } catch (e) { alert('Failed to build site'); }
};

window.appDeleteLead = async (id) => {
  if (!confirm('Delete this lead?')) return;
  await api(`/api/leads/${id}`, { method: 'DELETE' });
  loadLeads();
};

window.appMarkSent = async (id) => {
  await api(`/api/outreach/${id}`, { method: 'PATCH', body: { status: 'sent', sent_at: new Date().toISOString() } });
  loadOutreach();
};

window.appDeleteRec = async (id) => {
  if (!confirm('Delete this receptionist?')) return;
  await api(`/api/receptionists/${id}`, { method: 'DELETE' });
  loadReceptionist();
};

window.appRunProgress = async (id) => {
  const r = await api(`/api/runs/${id}`);
  const next = { find: 'gather', gather: 'build', build: 'pitch', pitch: 'done' }[r.phase] || 'done';
  await api(`/api/runs/${id}`, { method: 'PATCH', body: { phase: next, status: 'running', progress: Math.min(100, (r.progress || 0) + 25) } });
  loadRuns();
};

window.appDeleteRun = async (id) => {
  if (!confirm('Delete this run?')) return;
  await api(`/api/runs/${id}`, { method: 'DELETE' });
  loadRuns();
};

window.appAddRec = async () => {
  const phone = $('recPhone').value.trim();
  const voice = $('recVoice').value || 'alloy';
  if (!phone) return alert('Enter a phone number');
  await api('/api/receptionists', { method: 'POST', body: { phone_number: phone, voice } });
  $('recPhone').value = '';
  loadReceptionist();
};

window.appSaveSettings = async () => {
  await api('/api/auth/me', { method: 'PATCH', body: { name: $('setName').value.trim() || 'Founder', region: $('setRegion').value.trim(), plan: $('setPlan').value } });
  alert('Settings saved');
};

window.appStartRun = async () => {
  const { targets = [] } = await api('/api/targets');
  if (targets.length === 0) return alert('Add a target region first');
  const t = targets[0];
  await api('/api/runs', { method: 'POST', body: { target_id: t.id } });
  loadRuns();
  showSection('runs');
};

// ---- Init ----

document.addEventListener('DOMContentLoaded', async () => {
  // Navigation
  document.querySelectorAll('.nav-item').forEach(a => {
    a.addEventListener('click', (e) => { e.preventDefault(); showSection(a.dataset.section); });
  });
  $('btnMenu').addEventListener('click', () => { document.querySelector('.sidebar').classList.toggle('open'); });
  $('btnLogout').addEventListener('click', () => { showSection('dashboard'); });
  $('btnRefresh').addEventListener('click', () => { const s = document.querySelector('.nav-item.active').dataset.section; showSection(s); });
  $('btnNewRun').addEventListener('click', appStartRun);
  $('btnAddTarget').addEventListener('click', appAddTarget);
  $('btnSaveSettings').addEventListener('click', appSaveSettings);

  await loadUser();
  showSection('dashboard');
});

function escapeHtml(t){ return String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;" })[c]); }

