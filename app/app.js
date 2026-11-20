/* Klaudius dashboard SPA — honesty-first personal tool.
   Vanilla JS, zero build step. Calls the /api/* serverless functions.
   Nothing here claims a discovery, a send, a reply or a publish that did not happen. */
'use strict';

const BASE = '';
const userId = 'demo-user';

const SECTIONS = ['dashboard', 'targets', 'leads', 'sites', 'outreach', 'review', 'receptionist', 'runs', 'settings'];

async function api(path, { method = 'GET', body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const opts = { method, headers };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const r = await fetch(BASE + path, opts);
  if (!r.ok) {
    let detail = '';
    try { detail = (await r.json()).error || ''; } catch {}
    throw new Error(detail || `API ${r.status}`);
  }
  return r.json();
}

function parseJson(value, fallback) {
  if (value == null) return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value) || fallback; } catch { return fallback; }
}
function num(v) { return v == null ? 0 : Number(v) || 0; }
function when(t) { return t ? new Date(t).toLocaleDateString() : '—'; }

function showSection(name) {
  SECTIONS.forEach((s) => { $(`section-${s}`).style.display = (s === name) ? '' : 'none'; });
  document.querySelectorAll('.nav-item').forEach((a) => {
    a.classList.toggle('active', a.dataset.section === name);
  });
  $('topSection').textContent = name.charAt(0).toUpperCase() + name.slice(1);
  const subs = {
    dashboard: 'Build previews from details you supply',
    targets: 'Regions you track — discovery is manual',
    leads: 'CRM — provenance and verification first',
    sites: 'Private previews; publish only after review',
    outreach: 'Grounded drafts you send yourself',
    review: 'Approve previews and drafts; confirm sends yourself',
    receptionist: 'Demo script preview — not a live service',
    runs: 'Verified leads → previews → drafts → review',
    settings: 'Profile & defaults',
  };
  $('topSub').textContent = subs[name] || '';
  window.scrollTo({ top: 0 });
  if (name === 'dashboard') loadDashboard();
  else if (name === 'targets') loadTargets();
  else if (name === 'leads') loadLeads();
  else if (name === 'sites') loadSites();
  else if (name === 'outreach') loadOutreach();
  else if (name === 'review') loadReview();
  else if (name === 'receptionist') loadReceptionist();
  else if (name === 'runs') loadRuns();
  else if (name === 'settings') loadSettings();
}

function $(id) { return document.getElementById(id); }

async function loadUser() {
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

async function loadDashboard() {
  try {
    const [leadsRes, sitesRes, outRes, reviewRes] = await Promise.all([
      api('/api/leads'), api('/api/sites'), api('/api/outreach'), api('/api/outreach/review'),
    ]);
    const leads = leadsRes.leads || [];
    const sites = sitesRes.sites || [];
    const out = outRes.outreach || [];
    const queue = reviewRes.queue || [];
    $('statLeads').textContent = leads.length;
    $('statSites').textContent = sites.length;
    $('statDrafts').textContent = out.filter((o) => o.status === 'draft' || o.status === 'approved').length;
    $('statSent').textContent = out.filter((o) => !!o.sent_at && o.status === 'sent_by_user').length;
    $('statReview').textContent = queue.length;

    const activity = [];
    leads.slice(0, 3).forEach((l) => activity.push({
      m: `Lead added: ${l.name}`,
      d: `${l.intake_status || 'unverified'} · source: ${l.source || 'not recorded'}`,
      t: l.created_at,
    }));
    sites.slice(0, 3).forEach((s) => activity.push({
      m: s.published_at ? `Site published: ${s.title || s.url}` : `Site preview generated: ${s.title || s.url}`,
      d: s.status,
      t: s.created_at,
    }));
    out.slice(0, 3).forEach((o) => activity.push({
      m: o.sent_at && o.status === 'sent_by_user' ? `Pitch sent by you: ${o.subject || '(no subject)'}` : `Pitch draft prepared: ${o.subject || '(no subject)'}`,
      d: `Step ${num(o.sequence_step)} · ${o.channel || 'email'} · ${o.approval_status || 'pending'}`,
      t: o.created_at || o.sent_at,
    }));
    activity.sort((a, b) => new Date(b.t || 0) - new Date(a.t || 0));
    const list = $('activityList');
    list.innerHTML = '';
    if (activity.length === 0) {
      list.innerHTML = '<div class="act-item"><div class="act-m">No activity yet</div><div class="act-d">Add a verified lead or build a preview to see activity here.</div></div>';
    } else {
      activity.slice(0, 6).forEach((a) => {
        list.innerHTML += `<div class="act-item status-change"><div class="act-m">${escapeHtml(a.m)}</div><div class="act-d">${escapeHtml(a.d)}</div></div>`;
      });
    }
  } catch (e) { console.error(e); }
}

async function loadTargets() {
  try {
    const { targets = [] } = await api('/api/targets');
    const wrap = $('targetsTable');
    wrap.innerHTML = '';
    if (targets.length === 0) { wrap.innerHTML = '<div class="empty">No targets yet. Add your first region below.</div>'; return; }
    wrap.innerHTML = `<table><thead><tr><th>Region</th><th>Niche</th><th>Status</th><th>Leads added</th><th>Actions</th></tr></thead><tbody>${targets.map((t) => `
      <tr><td><strong>${escapeHtml(t.region)}</strong></td><td>${escapeHtml(t.niche || '—')}</td><td><span class="badge badge-${t.status}">${t.status}</span></td><td>${num(t.businesses_found)}</td><td>
        <button class="btn-sm" onclick="appDeleteTarget('${t.id}')">Delete</button>
      </td></tr>`).join('')}</tbody></table>`;
  } catch (e) { console.error(e); }
}

async function loadLeads() {
  try {
    const status = $('leadStatus').value;
    const url = status ? `/api/leads?status=${encodeURIComponent(status)}` : '/api/leads';
    const [{ leads = [] }, { sites = [] }] = await Promise.all([api(url), api('/api/sites')]);
    const q = $('leadSearch').value.toLowerCase();
    const hasSite = new Set(sites.map((s) => s.lead_id));
    const filtered = q ? leads.filter((l) => (l.name || '').toLowerCase().includes(q) || (l.website || '').toLowerCase().includes(q) || (l.niche || '').toLowerCase().includes(q)) : leads;
    const wrap = $('leadsTable');
    wrap.innerHTML = '';
    if (filtered.length === 0) { wrap.innerHTML = '<div class="empty">No leads match.</div>'; return; }
    wrap.innerHTML = `<table><thead><tr><th>Business</th><th>Source / verified</th><th>Score</th><th>Status</th><th>Actions</th></tr></thead><tbody>${filtered.map((l) => {
      const verified = l.intake_status === 'verified';
      const intake = l.intake_status || 'unverified';
      const source = l.source || 'not recorded';
      const canBuild = verified && !hasSite.has(l.id);
      const canPitch = verified && hasSite.has(l.id);
      return `<tr><td><strong>${escapeHtml(l.name)}</strong><div class="row-sub">${escapeHtml(l.niche || '—')} · ${escapeHtml(l.website || 'no website')}</div></td>
        <td><div class="row-sub">${escapeHtml(source)}</div><a href="${escapeHtml(l.source_url || '#')}" target="_blank" rel="noopener">${escapeHtml(l.source_url || 'no source URL')}</a>
          <div><span class="badge badge-${intake}">${intake}</span> ${l.verified_at ? `<span class="row-sub">verified ${when(l.verified_at)}</span>` : ''}</div></td>
        <td><span title="${escapeHtml(l.score_basis || 'No score basis recorded')}">${num(l.score)}</span>${l.score_basis ? `<div class="row-sub">${escapeHtml(l.score_basis)}</div>` : ''}</td>
        <td><span class="badge badge-${l.status}">${l.status}</span></td>
        <td class="actions-cell">
          <button class="btn-sm" onclick="appPitchLead('${l.id}')" ${canPitch ? '' : 'disabled title="Verify the lead and generate a site preview first"'}>Pitch draft</button>
          <button class="btn-sm" onclick="appBuildSite('${l.id}')" ${canBuild ? '' : 'disabled title="Lead must be verified and have no existing site"'}>Build preview</button>
          <button class="btn-sm danger" onclick="appDeleteLead('${l.id}')">Delete</button>
        </td></tr>`;
    }).join('')}</tbody></table>`;
    $('leadStatus').onchange = loadLeads;
    $('leadSearch').oninput = loadLeads;
  } catch (e) { console.error(e); }
}

async function loadSites() {
  try {
    const { sites = [] } = await api('/api/sites');
    const wrap = $('sitesTable');
    wrap.innerHTML = '';
    if (sites.length === 0) { wrap.innerHTML = '<div class="empty">No previews yet. Add a verified lead or build one from details you supply.</div>'; return; }
    wrap.innerHTML = `<table><thead><tr><th>Title</th><th>Status</th><th>Published</th><th>Actions</th></tr></thead><tbody>${sites.map((s) => `
      <tr><td><strong>${escapeHtml(s.title || s.url)}</strong><div class="row-sub">${escapeHtml(s.url)}</div></td>
        <td><span class="badge badge-${s.status}">${s.status}</span></td>
        <td>${s.published_at ? when(s.published_at) : '—'}</td>
        <td class="actions-cell">
          ${s.previewUrl ? `<a class="btn-sm" href="${escapeHtml(s.previewUrl)}" target="_blank" rel="noopener">Open preview</a>` : ''}
          ${s.status !== 'published' ? `<button class="btn-sm" onclick="appPublishSite('${s.id}')">Approve & publish</button>` : `<span class="row-sub">Publicly available</span>`}
        </td></tr>`).join('')}</tbody></table>`;
  } catch (e) { console.error(e); }
}

async function loadOutreach() {
  try {
    const { outreach = [] } = await api('/api/outreach');
    const wrap = $('outreachTable');
    wrap.innerHTML = '';
    if (outreach.length === 0) { wrap.innerHTML = '<div class="empty">No drafts yet. Pitch a verified lead with a site preview.</div>'; return; }
    wrap.innerHTML = `<table><thead><tr><th>Lead / step</th><th>Subject</th><th>Provenance</th><th>State</th><th>Actions</th></tr></thead><tbody>${outreach.map((o) => {
      const snap = parseJson(o.source_snapshot, {});
      const sent = !!o.sent_at && o.status === 'sent_by_user';
      return `<tr><td>${escapeHtml(o.lead_id)}<div class="row-sub">Step ${num(o.sequence_step)} · ${escapeHtml(o.channel || 'email')}</div></td>
        <td>${escapeHtml(o.subject || '—')}<div class="row-sub">${escapeHtml((o.body || '').slice(0, 90))}</div></td>
        <td><div class="row-sub">${escapeHtml((snap.fields || []).join(', ') || 'legacy draft — no snapshot')}</div>${escapeHtml((snap.site || {}).url || '')}</td>
        <td><span class="badge badge-${o.status}">${sent ? 'sent by you' : o.status}</span><div class="row-sub">${sent ? when(o.sent_at) : (o.approval_status || 'pending')}</div></td>
        <td class="actions-cell">
          <a class="btn-sm" href="mailto:?subject=${encodeURIComponent(o.subject || '')}&body=${encodeURIComponent(o.body || '')}">Opens email client; does not send</a>
          ${sent ? `<span class="row-sub">${escapeHtml(o.send_note || 'No note recorded')}</span>` : `<button class="btn-sm" onclick="appConfirmSend('${o.id}')">Confirm you sent it</button>`}
          ${num(o.sequence_step) < 5 ? `<button class="btn-sm" onclick="appCreateFollowup('${o.id}')">Draft follow-up</button>` : ''}
        </td></tr>`;
    }).join('')}</tbody></table>`;
  } catch (e) { console.error(e); }
}

async function loadReview() {
  try {
    const { queue = [] } = await api('/api/outreach/review');
    const wrap = $('reviewList');
    wrap.innerHTML = '';
    if (queue.length === 0) {
      wrap.innerHTML = '<div class="empty">Nothing needs review. Verified leads processed by a run will appear here.</div>';
      return;
    }
    const kindLabel = { site_approval: 'Site preview', draft_approval: 'Pitch draft', followup: 'Follow-up draft' };
    wrap.innerHTML = queue.map((q) => {
      const snap = parseJson(q.source_snapshot, {});
      const isSite = q.kind === 'site_approval';
      const siteUrl = (snap.site || {}).url || q.site_url || '';
      const fields = (snap.fields || []).length
        ? snap.fields.join(', ')
        : (isSite ? 'supplied business details' : 'legacy draft — no provenance snapshot');
      const services = snap.services || [];
      const approved = q.approval_status === 'approved';
      const slugMatch = String(q.site_url || '').match(/\/site\/([^/?#]+)/);
      const previewUrl = q.preview_token && slugMatch
        ? `/api/site?slug=${encodeURIComponent(slugMatch[1])}&token=${encodeURIComponent(q.preview_token)}`
        : '';
      let actions;
      if (isSite) {
        actions = `${previewUrl ? `<a class="btn-sm" href="${escapeHtml(previewUrl)}" target="_blank" rel="noopener">Open private preview</a>` : ''}
          <button class="btn-sm" onclick="appPublishSite('${q.site_id}')">Approve & publish</button>
          <button class="btn-sm" onclick="appDismissReview('${q.task_id}')">Dismiss</button>`;
      } else if (!approved) {
        actions = `<button class="btn-sm" onclick="appApproveDraft('${q.id}')">Approve draft</button>
          <button class="btn-sm" onclick="appDismissReview('${q.task_id}')">Dismiss</button>`;
      } else {
        actions = `<button class="btn-sm" onclick="appConfirmSend('${q.id}')">Confirm manual send</button>
          <button class="btn-sm" onclick="appCreateFollowup('${q.id}')">Draft follow-up</button>
          <button class="btn-sm" onclick="appSnoozeReview('${q.task_id}')">Snooze</button>`;
      }
      return `<div class="review-item status-change">
        <div class="review-head"><strong>${escapeHtml(q.lead_name || q.site_url || 'Review item')}</strong><span class="badge badge-${q.kind}">${kindLabel[q.kind] || q.kind}</span></div>
        <div class="review-meta">Source: ${escapeHtml(q.lead_source || '—')} · Intake: ${escapeHtml(q.intake_status || '—')} · Step ${num(q.sequence_step)}</div>
        <div class="review-provenance"><strong>Built from:</strong> ${escapeHtml(fields)}<br><strong>Site URL:</strong> ${escapeHtml(siteUrl || '—')}
          ${services.length ? `<br><strong>Services:</strong> ${escapeHtml(services.join(', '))}` : ''}</div>
        ${isSite ? '' : `<div class="review-body"><strong>${escapeHtml(q.subject || '')}</strong><div class="row-sub">${escapeHtml(q.body || '')}</div></div>`}
        ${q.next_follow_up_at ? `<div class="review-meta">Follow-up snoozed to ${when(q.next_follow_up_at)}</div>` : ''}
        <div class="review-actions">${actions}${isSite ? '' : `<a class="btn-sm" href="mailto:?subject=${encodeURIComponent(q.subject || '')}&body=${encodeURIComponent(q.body || '')}">Opens email client; does not send</a>`}</div>
      </div>`;
    }).join('');
  } catch (e) { console.error(e); }
}

async function loadReceptionist() {
  try {
    const { receptionists = [] } = await api('/api/receptionists');
    const wrap = $('receptionistTable');
    wrap.innerHTML = '';
    if (receptionists.length === 0) { wrap.innerHTML = '<div class="empty">No receptionist numbers yet. Add one below.</div>'; return; }
    wrap.innerHTML = `<table><thead><tr><th>Phone number</th><th>Voice</th><th>Status</th><th>Actions</th></tr></thead><tbody>${receptionists.map((r) => `
      <tr><td><strong>${escapeHtml(r.phone_number)}</strong></td><td>${escapeHtml(r.voice || 'alloy')}</td><td><span class="badge badge-${r.status}">${r.status}</span></td><td>
        <button class="btn-sm" onclick="appSimulateCall('${r.phone_number}')">Simulate call</button>
        <button class="btn-sm danger" onclick="appDeleteRec('${r.id}')">Delete</button>
      </td></tr>`).join('')}</tbody></table>`;
  } catch (e) { console.error(e); }
  if (!$('call-log-area')) {
    const area = document.createElement('div');
    area.id = 'call-log-area';
    area.style.marginTop = '16px';
    wrap.parentNode.insertBefore(area, wrap.nextSibling);
  }
}

async function loadRuns() {
  try {
    const { runs = [] } = await api('/api/runs');
    const wrap = $('runsTable');
    wrap.innerHTML = '';
    if (runs.length === 0) { wrap.innerHTML = '<div class="empty">No runs yet. Add verified leads, then start a run.</div>'; return; }
    wrap.innerHTML = `<table><thead><tr><th>Target</th><th>Phase</th><th>Status</th><th>Real result</th><th>Actions</th></tr></thead><tbody>${runs.map((r) => {
      const result = parseJson(r.result, {});
      const summary = `Sites: ${num(result.sitesGenerated)} · Drafts: ${num(result.draftsCreated)} · Review: ${num(result.reviewTasksQueued)} · Errors: ${(result.errors || []).length}`;
      return `<tr><td>${escapeHtml(r.target_id)}</td><td>${escapeHtml(r.phase)}</td><td><span class="badge badge-${r.status}">${r.status}</span></td>
        <td><div class="row-sub">${summary}</div><div class="row-sub">Considered: ${num(result.leadsConsidered)} verified lead(s)</div></td>
        <td class="actions-cell"><button class="btn-sm" onclick="appViewRun('${r.id}')">Details</button>
          <button class="btn-sm danger" onclick="appDeleteRun('${r.id}')">Delete</button></td></tr>`;
    }).join('')}</tbody></table>`;
  } catch (e) { console.error(e); }
}

async function loadSettings() { await loadUser(); }

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

window.appAddLead = async () => {
  const val = (id) => ($(id)?.value || '').trim();
  const name = val('leadNewName');
  const source = val('leadNewSource');
  const score = Number(val('leadNewScore')) || 0;
  const scoreBasis = val('leadNewScoreBasis');
  if (!name) return alert('Enter the business name.');
  if (!source) return alert('Enter a source — where did this lead come from?');
  if (score > 0 && !scoreBasis) return alert('A score above zero needs a score basis explaining it.');
  if (!$('leadNewVerified').checked) return alert('Only add a lead here after you have personally verified its details.');
  const services = val('leadNewServices').split(',').map((s) => s.trim()).filter(Boolean);
  try {
    await api('/api/leads', {
      method: 'POST',
      body: {
        name, source, source_url: val('leadNewSourceUrl'), niche: val('leadNewNiche'),
        website: val('leadNewWebsite'), phone: val('leadNewPhone'), email: val('leadNewEmail'),
        address: val('leadNewAddress'), score, score_basis: scoreBasis, verified: true,
        details: { services },
      },
    });
    ['leadNewName', 'leadNewSource', 'leadNewSourceUrl', 'leadNewNiche', 'leadNewWebsite',
     'leadNewPhone', 'leadNewEmail', 'leadNewAddress', 'leadNewServices', 'leadNewScore',
     'leadNewScoreBasis'].forEach((id) => { $(id).value = ''; });
    loadLeads();
    loadDashboard();
  } catch (e) { alert('Could not add lead: ' + e.message); }
};

window.appPitchLead = async (id) => {
  if (!confirm('Prepare a grounded pitch draft from this lead and its site preview? Nothing is sent.')) return;
  try {
    const { outreach } = await api('/api/outreach', { method: 'POST', body: { lead_id: id } });
    alert('Pitch draft prepared. Review it before sending anything.');
    loadOutreach();
    loadReview();
    loadDashboard();
  } catch (e) { alert('Could not prepare pitch: ' + e.message); }
};

window.appBuildSite = async (id) => {
  if (!confirm('Generate a private site preview from this lead\'s supplied details?')) return;
  try {
    const result = await api('/api/builder', { method: 'POST', body: { lead_id: id } });
    alert(`Preview generated: ${result.site.previewUrl}\nThis is NOT published. Approve it in Sites to make it public.`);
    loadLeads();
    loadSites();
    loadReview();
    loadDashboard();
  } catch (e) { alert('Could not build preview: ' + e.message); }
};

window.appPublishSite = async (id) => {
  if (!confirm('Publish this preview? It will become publicly accessible. Only do this after you have checked every detail.')) return;
  try {
    await api(`/api/sites/${id}`, { method: 'PATCH', body: { publish: true } });
    loadSites();
    loadReview();
    loadDashboard();
  } catch (e) { alert('Could not publish: ' + e.message); }
};

window.appDeleteLead = async (id) => {
  if (!confirm('Delete this lead?')) return;
  await api(`/api/leads/${id}`, { method: 'DELETE' });
  loadLeads();
};

window.appApproveDraft = async (id) => {
  if (!confirm('Approve this draft? You still send it yourself; nothing is sent automatically.')) return;
  try {
    await api('/api/outreach/approve', { method: 'POST', body: { id } });
    loadReview();
    loadOutreach();
    loadDashboard();
  } catch (e) { alert('Could not approve: ' + e.message); }
};

window.appConfirmSend = async (id) => {
  const note = prompt('Confirm that YOU sent this message yourself. Add a short note (optional):');
  if (note === null) return;
  try {
    await api('/api/outreach/confirm-send', { method: 'POST', body: { id, note } });
    loadReview();
    loadOutreach();
    loadDashboard();
  } catch (e) { alert('Could not confirm send: ' + e.message); }
};

window.appCreateFollowup = async (id) => {
  if (!confirm('Draft the next grounded follow-up? It will be queued for review; nothing is sent.')) return;
  try {
    await api('/api/outreach/followup', { method: 'POST', body: { id } });
    loadReview();
    loadOutreach();
    loadDashboard();
  } catch (e) { alert('Could not draft follow-up: ' + e.message); }
};

window.appDismissReview = async (id) => {
  if (!confirm('Dismiss this review task?')) return;
  try {
    await api(`/api/outreach/review/${id}`, { method: 'PATCH', body: { done: true } });
    loadReview();
    loadDashboard();
  } catch (e) { alert('Could not dismiss: ' + e.message); }
};

window.appSnoozeReview = async (id) => {
  const value = prompt('Snooze the follow-up to an ISO date/time (blank clears it):', '');
  if (value === null) return;
  try {
    await api(`/api/outreach/review/${id}`, { method: 'PATCH', body: { next_follow_up_at: value } });
    loadReview();
  } catch (e) { alert('Could not snooze: ' + e.message); }
};

window.appDeleteRec = async (id) => {
  if (!confirm('Delete this receptionist?')) return;
  await api(`/api/receptionists/${id}`, { method: 'DELETE' });
  loadReceptionist();
};

window.appSimulateCall = async (phone) => {
  const area = $('call-log-area');
  const script = [
    { who: 'Caller', text: 'Hi, I would like to book an appointment.' },
    { who: 'Receptionist', text: 'Sure, what day and time works for you?' },
    { who: 'Caller', text: 'Tomorrow at 2pm, please.' },
    { who: 'Receptionist', text: 'Noted. Let me pass that to the business to confirm.' },
  ];
  const html = script.map((t) => `<div style="margin:6px 0"><strong style="color:var(--gold)">${escapeHtml(t.who)}:</strong> ${escapeHtml(t.text)}</div>`).join('');
  area.innerHTML = `<div style="margin-bottom:8px"><strong>Sample script for ${escapeHtml(phone)}</strong></div>
    <div style="font-size:11px;color:var(--slate);margin-bottom:10px">DEMO ONLY — no call was placed and no appointment was booked. Connect a telephony provider to answer real calls.</div>
    ${html}<hr style="margin:12px 0;border:none;border-top:1px solid var(--line)">${area.innerHTML}`;
};

window.appViewRun = async (id) => {
  try {
    const { run } = await api(`/api/runs/${id}`);
    const result = parseJson(run.result, {});
    const errors = (result.errors || []).map((e) => `${e.phase}: ${e.leadId} — ${e.message}`).join('\n');
    alert(`Run ${run.id}\nPhase: ${run.phase}\nStatus: ${run.status}\n\nReal results:\n- Preview sites: ${num(result.sitesGenerated)}\n- Grounded drafts: ${num(result.draftsCreated)}\n- Review tasks queued: ${num(result.reviewTasksQueued)}\n- Verified leads considered: ${num(result.leadsConsidered)}\n- Errors: ${(result.errors || []).length}${errors ? '\n\n' + errors : ''}\n\nNo discovery was performed. Nothing was published or sent.`);
  } catch (e) { alert('Could not load run: ' + e.message); }
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
  if (targets.length === 0) return alert('Add a target region first.');
  try {
    const created = await api('/api/runs', { method: 'POST', body: { target_id: targets[0].id } });
    showSection('runs');
    const result = created.run.result || {};
    alert(`Run complete. Real results:\n- Preview sites generated: ${num(result.sitesGenerated)}\n- Grounded drafts created: ${num(result.draftsCreated)}\n- Review tasks queued: ${num(result.reviewTasksQueued)}\n- Errors: ${(result.errors || []).length}\n\nNo businesses were discovered. Nothing was published or sent. Review items are in the Review section.`);
    loadRuns(); loadLeads(); loadSites(); loadReview(); loadDashboard();
  } catch (e) {
    alert(`Run failed: ${e.message}`);
  }
};

// ---- Real site build from user-supplied details ----

window.buildFromForm = async () => {
  const val = (id) => ($(id)?.value || '').trim();
  const name = val('bfName');
  if (!name) { alert('Enter a business name first.'); return; }
  const photos = val('bfPhotos').split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  const services = val('bfServices').split(',').map((s) => s.trim()).filter(Boolean);
  const result = $('bfResult');
  result.innerHTML = 'Building preview…';
  try {
    const data = await api('/api/freebuild', {
      method: 'POST',
      body: {
        name, region: val('bfAddress'), niche: val('bfNiche'), address: val('bfAddress'),
        phone: val('bfPhone'), email: val('bfEmail'), website: val('bfWebsite'),
        about: val('bfAbout'), services, photos, design: val('bfDesign'),
      },
    });
    const preview = data.previewUrl || data.siteUrl;
    result.innerHTML = `<strong>Private preview ready.</strong> <a href="${escapeHtml(preview)}" target="_blank" rel="noopener">Open preview</a><br><span style="color:var(--slate)">${escapeHtml(data.note || '')}</span>`;
    loadDashboard();
    loadSites();
  } catch (e) {
    result.textContent = `Could not build preview: ${e.message}`;
  }
};

// ---- Init ----

document.addEventListener('DOMContentLoaded', async () => {
  document.querySelectorAll('.nav-item').forEach((a) => {
    a.addEventListener('click', (e) => { e.preventDefault(); showSection(a.dataset.section); });
  });
  $('btnMenu').addEventListener('click', () => { document.querySelector('.sidebar').classList.toggle('open'); });
  $('btnLogout').addEventListener('click', () => { showSection('dashboard'); });
  $('btnRefresh').addEventListener('click', () => { const s = document.querySelector('.nav-item.active').dataset.section; showSection(s); });
  $('btnNewRun').addEventListener('click', appStartRun);
  $('btnAddTarget').addEventListener('click', appAddTarget);
  $('btnAddLead').addEventListener('click', appAddLead);
  $('btnAddRec').addEventListener('click', appAddRec);
  $('btnFreeBuild').addEventListener('click', buildFromForm);
  $('btnSaveSettings').addEventListener('click', appSaveSettings);

  await loadUser();
  showSection('dashboard');
});

function escapeHtml(t) {
  return String(t == null ? '' : t).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}
