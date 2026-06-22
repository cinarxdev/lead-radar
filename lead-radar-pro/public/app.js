const $ = id => document.getElementById(id);

const state = {
  status: null,
  leads: { main: [], research: [], history: [] },
  agents: { agents: [], events: [] },
  fields: { groups: [], fields: {}, presets: {} },
  fieldSelection: {},
  logs: [],
  serverLogs: []
};

const geoState = { mode: 'none', center: null, radius: 1500, polygon: [] };
let geoMap = null;
let geoLayer = null;
let geoMarkers = [];
let pendingRunChoice = null;
let pollTimer = null;

const AGENT_ICONS = {
  orchestrator: 'brain',
  'geo-router': 'compass',
  'maps-scraper': 'map',
  'field-filter': 'filter',
  'lead-cleaner': 'sparkles',
  enricher: 'wand-2',
  'sheets-sync': 'sheet',
  'qa-auditor': 'shield-check'
};

const AGENT_POSITIONS = {
  orchestrator: [50, 48],
  'geo-router': [50, 12],
  'maps-scraper': [22, 28],
  'lead-cleaner': [78, 28],
  'field-filter': [22, 52],
  enricher: [78, 52],
  'sheets-sync': [22, 78],
  'qa-auditor': [78, 78]
};

const PIPELINE_STEPS = [
  { id: 'maps-scraper', label: 'Maps Scrape' },
  { id: 'lead-cleaner', label: 'Temizleme' },
  { id: 'field-filter', label: 'Alan Filtre' },
  { id: 'enricher', label: 'Zenginleştirme' }
];

const LOCATION_PRESETS = [
  { label: 'Kadıköy', district: 'Kadıköy', neighborhoods: 'Moda,Caferağa' },
  { label: 'Beşiktaş', district: 'Beşiktaş', neighborhoods: 'Etiler,Levent' },
  { label: 'Şişli', district: 'Şişli', neighborhoods: 'Nişantaşı,Bomonti' },
  { label: 'Beyoğlu', district: 'Beyoğlu', neighborhoods: 'Cihangir,Karaköy' }
];

const FIELD_LABELS = {
  name: 'Ad', category: 'Kategori', freshnessScore: 'Skor', leadQuality: 'Kalite',
  phone: 'Telefon', website: 'Web', address: 'Adres', district: 'İlçe',
  rating: 'Puan', reviewsCount: 'Yorum', aiNote: 'AI Not', mapsLink: 'Maps',
  platformPresence: 'Platform', menuSummary: 'Menü', leadStatus: 'Durum'
};

function icons() {
  if (window.lucide) lucide.createIcons();
}

function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3500);
}

function log(msg) {
  state.logs.unshift(`[${new Date().toLocaleTimeString('tr-TR')}] ${msg}`);
  state.logs = state.logs.slice(0, 80);
  if ($('logBox')) $('logBox').innerHTML = state.logs.map(x => `<div>${esc(x)}</div>`).join('');
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
}

function route(name) {
  if (name) location.hash = `#/${name}`;
  const current = (location.hash.replace('#/', '') || 'overview').split('?')[0];
  document.querySelectorAll('.page').forEach(p => p.classList.toggle('active', p.dataset.page === current));
  document.querySelectorAll('.nav a').forEach(a => {
    const isActive = a.dataset.route === current;
    a.classList.toggle('active', isActive);
    if (isActive) {
      const group = a.closest('.nav-group');
      if (group) group.classList.add('open');
    }
  });
  if (current === 'discovery') setTimeout(() => { initGeoMap(); icons(); }, 100);
  if (current === 'fields') renderFieldToggles();
  if (current === 'history') renderHistory();
  if (current === 'settings') populateSettingsForm();
  icons();
}

function getSelectedFields() {
  return Object.entries(state.fieldSelection).filter(([, v]) => v).map(([k]) => k);
}

function applyPreset(name) {
  const keys = state.fields.presets?.[name] || [];
  state.fieldSelection = {};
  for (const k of Object.keys(state.fields.fields || {})) {
    state.fieldSelection[k] = keys.includes(k);
  }
  for (const [k, meta] of Object.entries(state.fields.fields || {})) {
    if (meta.locked) state.fieldSelection[k] = true;
  }
  renderFieldToggles();
  updateFieldCount();
  toast(`${name} preset uygulandı`);
}

function updateFieldCount() {
  const total = Object.keys(state.fields.fields || {}).length;
  const selected = getSelectedFields().length;
  const pct = total ? Math.round((selected / total) * 100) : 0;
  if ($('mFields')) $('mFields').textContent = selected;
  if ($('fieldCountLabel')) $('fieldCountLabel').textContent = `${selected} / ${total} alan`;
  if ($('fieldCountBar')) $('fieldCountBar').style.width = `${pct}%`;
}

function renderFieldToggles() {
  const box = $('fieldToggles');
  if (!box || !state.fields.groups) return;
  let html = '';
  for (const group of state.fields.groups) {
    const items = Object.entries(state.fields.fields).filter(([, m]) => m.group === group.id);
    if (!items.length) continue;
    html += `<div class="field-group-title">${esc(group.label)}</div>`;
    for (const [key, meta] of items) {
      const checked = state.fieldSelection[key] ? 'checked' : '';
      const locked = meta.locked ? 'locked' : '';
      const disabled = meta.locked ? 'disabled' : '';
      html += `<div class="toggle-row ${locked}">
        <div class="info"><b>${esc(meta.label)}</b><small>${esc(key)}</small></div>
        <label class="switch"><input type="checkbox" data-field="${key}" ${checked} ${disabled} /><span class="slider"></span></label>
      </div>`;
    }
  }
  box.innerHTML = html;
  box.querySelectorAll('input[data-field]').forEach(inp => {
    inp.addEventListener('change', () => {
      state.fieldSelection[inp.dataset.field] = inp.checked;
      updateFieldCount();
    });
  });
  updateFieldCount();
  icons();
}

function renderFieldPresets() {
  const box = $('fieldPresets');
  if (!box) return;
  box.innerHTML = Object.keys(state.fields.presets || {}).map(name =>
    `<button class="chip" data-preset="${name}"><i data-lucide="layers"></i> ${esc(name)}</button>`
  ).join('');
  box.querySelectorAll('[data-preset]').forEach(btn => {
    btn.addEventListener('click', () => applyPreset(btn.dataset.preset));
  });
  icons();
}

function renderLocationPresets() {
  const box = $('locationPresets');
  if (!box) return;
  box.innerHTML = LOCATION_PRESETS.map(p =>
    `<button class="chip" data-district="${esc(p.district)}" data-neighborhoods="${esc(p.neighborhoods)}"><i data-lucide="map-pin"></i> ${esc(p.label)}</button>`
  ).join('');
  box.querySelectorAll('.chip[data-district]').forEach(btn => {
    btn.addEventListener('click', () => {
      $('district').value = btn.dataset.district;
      $('neighborhoods').value = btn.dataset.neighborhoods;
      toast(`${btn.dataset.district} seçildi`);
    });
  });
  icons();
}

function renderMapToolbar() {
  const box = $('mapToolbar');
  if (!box) return;
  const tools = [
    { mode: 'none', icon: 'globe', label: 'Serbest' },
    { mode: 'circle', icon: 'circle', label: 'Daire' },
    { mode: 'polygon', icon: 'pentagon', label: 'Poligon' },
    { action: 'finish', icon: 'check', label: 'Tamamla' },
    { action: 'clear', icon: 'eraser', label: 'Temizle' }
  ];
  box.innerHTML = tools.map(t => {
    if (t.action) return `<button class="chip" data-action="${t.action}"><i data-lucide="${t.icon}"></i> ${t.label}</button>`;
    return `<button class="chip" data-geo-mode="${t.mode}"><i data-lucide="${t.icon}"></i> ${t.label}</button>`;
  }).join('') + `<span class="geo-pill" id="geoSummary">geo: kapalı</span>`;
  box.querySelectorAll('[data-geo-mode]').forEach(btn => {
    btn.addEventListener('click', () => setGeoMode(btn.dataset.geoMode));
  });
  box.querySelector('[data-action="finish"]')?.addEventListener('click', finishPolygon);
  box.querySelector('[data-action="clear"]')?.addEventListener('click', () => clearGeoArea());
  $('geoRadius')?.addEventListener('change', redrawGeo);
  icons();
}

function initGeoMap() {
  if (!$('geoMap') || !window.L) return;
  if (geoMap) {
    [0, 100, 300].forEach(t => setTimeout(() => geoMap.invalidateSize(true), t));
    return;
  }
  geoMap = L.map('geoMap', { zoomControl: true }).setView([41.0082, 28.9784], 12);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap'
  }).addTo(geoMap);
  geoMap.on('click', e => {
    if (geoState.mode === 'circle') {
      geoState.center = { lat: e.latlng.lat, lng: e.latlng.lng };
      geoState.radius = Number($('geoRadius')?.value || 1500);
      redrawGeo();
    }
    if (geoState.mode === 'polygon') {
      geoState.polygon.push({ lat: e.latlng.lat, lng: e.latlng.lng });
      redrawGeo();
    }
  });
  setTimeout(() => geoMap.invalidateSize(true), 200);
  updateGeoSummary();
}

function setGeoMode(mode) {
  geoState.mode = mode;
  if (mode === 'none') clearGeoArea(false);
  if (mode === 'circle') toast('Haritada merkeze tıkla');
  if (mode === 'polygon') toast('Poligon noktalarını tıkla');
  updateGeoSummary();
  initGeoMap();
}

function clearGeoArea(show = true) {
  geoState = { mode: 'none', center: null, radius: Number($('geoRadius')?.value || 1500), polygon: [] };
  redrawGeo();
  if (show) toast('Harita temizlendi');
}

function finishPolygon() {
  if (geoState.polygon.length < 3) { toast('En az 3 nokta gerekli'); return; }
  geoState.mode = 'polygon';
  redrawGeo();
  toast('Poligon hazır');
}

function redrawGeo() {
  if (!geoMap) return;
  geoState.radius = Number($('geoRadius')?.value || 1500);
  if (geoLayer) { geoMap.removeLayer(geoLayer); geoLayer = null; }
  geoMarkers.forEach(m => geoMap.removeLayer(m));
  geoMarkers = [];
  if (geoState.mode === 'circle' && geoState.center) {
    geoLayer = L.circle([geoState.center.lat, geoState.center.lng], {
      radius: geoState.radius, color: '#ff6a00', weight: 3, fillColor: '#ff9a3d', fillOpacity: 0.15
    }).addTo(geoMap);
  }
  if (geoState.mode === 'polygon' && geoState.polygon.length) {
    geoMarkers = geoState.polygon.map((p, i) =>
      L.circleMarker([p.lat, p.lng], { radius: 5, color: '#ff9a3d', fillColor: '#ff6a00', fillOpacity: 1 })
        .bindTooltip(String(i + 1)).addTo(geoMap)
    );
    if (geoState.polygon.length >= 3) {
      geoLayer = L.polygon(geoState.polygon.map(p => [p.lat, p.lng]), {
        color: '#ff6a00', weight: 3, fillColor: '#ff9a3d', fillOpacity: 0.12
      }).addTo(geoMap);
    }
  }
  updateGeoSummary();
}

function getGeoPayload() {
  if (geoState.mode === 'circle' && geoState.center) {
    return { mode: 'circle', center: geoState.center, radius: Number($('geoRadius')?.value || 1500) };
  }
  if (geoState.mode === 'polygon' && geoState.polygon.length >= 3) {
    return { mode: 'polygon', polygon: geoState.polygon };
  }
  return null;
}

function updateGeoSummary() {
  const g = getGeoPayload();
  const sum = $('geoSummary');
  const st = $('geoStatus');
  if (!sum) return;
  if (!g) {
    sum.textContent = 'geo: kapalı';
    if (st) st.textContent = 'Kapalı';
    return;
  }
  if (g.mode === 'circle') {
    sum.textContent = `daire ${Math.round(g.radius)}m`;
    if (st) st.textContent = `Daire · ${g.center.lat.toFixed(4)}, ${g.center.lng.toFixed(4)}`;
  } else {
    sum.textContent = `poligon ${g.polygon.length} nokta`;
    if (st) st.textContent = `Poligon · ${g.polygon.length} nokta`;
  }
}

function describeGeo(g) {
  if (!g) return 'Harita seçimi yok';
  if (g.mode === 'circle') return `Daire ${Math.round(g.radius)}m`;
  return `Poligon ${g.polygon.length} nokta`;
}

function askRunChoice(geoArea) {
  return new Promise(resolve => {
    pendingRunChoice = resolve;
    $('runMapSummary').textContent = describeGeo(geoArea);
    $('runInputSummary').textContent = `${$('district').value} · ${$('neighborhoods').value} · ${$('terms').value}`;
    $('runModal').classList.add('show');
    icons();
  });
}

function resolveRunChoice(choice) {
  if (!pendingRunChoice) return;
  $('runModal').classList.remove('show');
  const done = pendingRunChoice;
  pendingRunChoice = null;
  done(choice);
}

function buildRunBody(source) {
  const selectedGeo = getGeoPayload();
  const geoArea = source === 'map' ? selectedGeo : null;
  const fields = {};
  for (const [k, v] of Object.entries(state.fieldSelection)) fields[k] = v;
  return {
    district: $('district').value,
    neighborhoods: $('neighborhoods').value.split(',').map(x => x.trim()).filter(Boolean),
    searchTerms: $('terms').value.split(',').map(x => x.trim()).filter(Boolean),
    limit: Number($('limit').value || 20),
    maxFinalLeads: Number($('maxFinalLeads').value || 30),
    maxMain: Number($('maxMain')?.value || 100),
    minFreshness: Number($('minFreshness').value || 0),
    maxReviews: Number($('maxReviews').value || 0),
    sortBy: $('sortBy').value,
    mainMode: $('mainMode').value,
    requirePhone: $('requirePhone').checked,
    enableAi: $('enableAi').checked,
    geoArea,
    fields,
    runSource: source
  };
}

async function runDiscovery() {
  const geo = getGeoPayload();
  const source = await askRunChoice(geo);
  if (!source) { toast('İptal edildi'); return; }
  if (source === 'map' && !geo) { toast('Önce haritada bölge seç'); route('discovery'); return; }
  const body = buildRunBody(source);
  log('Run gönderiliyor: ' + JSON.stringify({ source, fields: getSelectedFields().length }));
  toast(`Tarama başlatıldı · ${getSelectedFields().length} alan`);
  route('agents');
  const r = await fetch('/api/run', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const data = await r.json();
  if (!r.ok) { toast(data.error || 'Başlatılamadı'); return; }
  refreshAll();
}

async function refreshAll() {
  try {
    const [s, l, a, lg, f] = await Promise.all([
      fetch('/api/status').then(r => r.json()),
      fetch('/api/leads').then(r => r.json()),
      fetch('/api/agents').then(r => r.json()),
      fetch('/api/logs').then(r => r.json()),
      fetch('/api/fields').then(r => r.json())
    ]);
    state.status = s;
    state.leads = l;
    state.agents = a;
    state.serverLogs = lg.logs || [];
    state.fields = f;
    if (!Object.keys(state.fieldSelection).length) {
      for (const k of Object.keys(f.fields || {})) state.fieldSelection[k] = true;
      if (l.settings?.lastFields?.length) {
        state.fieldSelection = {};
        for (const k of Object.keys(f.fields)) state.fieldSelection[k] = l.settings.lastFields.includes(k);
      }
    }
    renderAll();
  } catch (e) {
    log('API hata: ' + e.message);
    toast('API erişim hatası');
  }
}

function renderAll() {
  renderStatus();
  renderLeads();
  renderAgents();
  renderServerLogs();
  renderHistory();
  renderPipelineBox();
  renderOverviewCmd();
  icons();
}

function renderStatus() {
  const s = state.status || {};
  const cfg = s.config || {};
  $('mMain').textContent = (state.leads.main || []).length;
  $('mResearch').textContent = (state.leads.research || []).length;
  updateFieldCount();
  const conn = [cfg.hasLocalScraper, cfg.hasModelApiKey].filter(Boolean).length;
  $('mConn').textContent = `${conn}/2`;
  const running = s.running;
  const pill = $('livePill');
  pill.className = 'status-pill' + (running ? ' running' : '');
  pill.innerHTML = `<span class="dot"></span> ${running ? 'Tarama aktif' : 'Online'}`;
  $('sideHealth').textContent = running ? 'Tarama çalışıyor' : 'Hazır';
  $('sideHealthText').textContent = `Scraper ${cfg.hasLocalScraper ? 'hazır' : 'eksik'} · Model ${cfg.hasModelApiKey ? 'bağlı' : 'eksik'}`;
  const main = state.leads.main || [];
  $('kpiHot').textContent = main.filter(x => Number(x.freshnessScore) >= 7).length;
  $('kpiPhone').textContent = main.filter(x => x.phone).length;
  $('kpiWeb').textContent = main.filter(x => x.website).length;
  $('settingsInfo').innerHTML = [
    `Port: ${cfg.port || '-'}`,
    `Model: ${cfg.baseUrl || '-'}`,
    `Scraper: ${cfg.hasLocalScraper ? 'hazır' : 'eksik'}`
  ].map(x => `<div>${esc(x)}</div>`).join('');
}

function renderOverviewCmd() {
  const box = $('overviewCmd');
  if (!box) return;
  const fields = getSelectedFields();
  box.innerHTML = [
    ['Seçili Alan', `${fields.length} veri alanı`],
    ['AI', $('enableAi')?.checked ? 'Aktif' : 'Kapalı'],
    ['Main Mod', $('mainMode')?.value || 'new-only'],
    ['Son Run', state.status?.lastRun?.status || '-']
  ].map(([k, v]) => `<div class="toggle-row"><div class="info"><b>${esc(k)}</b></div><span class="geo-pill">${esc(v)}</span></div>`).join('');
}

function renderPipelineBox() {
  const box = $('pipelineBox');
  if (!box) return;
  const agents = state.agents?.agents || [];
  box.innerHTML = PIPELINE_STEPS.map(step => {
    const a = agents.find(x => x.id === step.id);
    const cls = a?.status === 'done' ? 'done' : a?.status === 'running' ? 'hot' : '';
    return `<div class="step ${cls}"><b>${esc(step.label)}</b><span>${esc(a?.lastMessage || 'Beklemede')}</span></div>`;
  }).join('');
}

function renderAgents() {
  const agents = state.agents?.agents || [];
  const running = agents.filter(a => a.status === 'running').length;
  $('agentSummary').textContent = `${running} aktif · ${agents.length} agent`;
  const net = $('agentNetwork');
  if (net) net.classList.toggle('live', running > 0);

  const graphIds = ['orchestrator', ...Object.keys(AGENT_POSITIONS).filter(k => k !== 'orchestrator')];
  const byId = Object.fromEntries(agents.map(a => [a.id, a]));

  $('agentNodes').innerHTML = graphIds.filter(id => byId[id] || AGENT_POSITIONS[id]).map(id => {
    const a = byId[id] || { id, name: id, status: 'idle', progress: 0, lastMessage: 'Beklemede' };
    const pos = AGENT_POSITIONS[id] || [50, 50];
    const icon = AGENT_ICONS[id] || 'bot';
    return `<div class="agent-node ${id === 'orchestrator' ? 'orchestrator ' : ''}${a.status || 'idle'}" style="--x:${pos[0]}%;--y:${pos[1]}%;--p:${a.progress || 0}%">
      <div class="node-top"><div class="node-ico"><i data-lucide="${icon}"></i></div>
      <div class="node-main"><b>${esc(a.name)}</b><small>${esc(a.model || '')}</small></div></div>
      <div class="node-msg">${esc(a.lastMessage || '')}</div>
      <div class="node-progress"><i></i></div></div>`;
  }).join('');

  const links = [['orchestrator', 'geo-router'], ['geo-router', 'maps-scraper'], ['maps-scraper', 'lead-cleaner'], ['lead-cleaner', 'field-filter'], ['field-filter', 'enricher'], ['enricher', 'qa-auditor']];
  const runningIds = new Set(agents.filter(a => a.status === 'running').map(a => a.id));
  $('agentLinks').innerHTML = links.filter(([f, t]) => AGENT_POSITIONS[f] && AGENT_POSITIONS[t]).map(([f, t]) => {
    const a = byId[t] || {};
    const p1 = AGENT_POSITIONS[f];
    const p2 = AGENT_POSITIONS[t];
    const active = runningIds.has(t) || runningIds.has(f);
    const cls = active ? 'running' : a.status === 'done' ? 'done' : '';
    return `<path class="agent-link ${cls}" d="M ${p1[0]} ${p1[1]} L ${p2[0]} ${p2[1]}"/>`;
  }).join('');

  $('agentRows').innerHTML = agents.map(a => {
    const icon = AGENT_ICONS[a.id] || 'bot';
    return `<div class="agent-row ${a.status || ''}">
      <div class="node-ico"><i data-lucide="${icon}"></i></div>
      <div><b>${esc(a.name)}</b><br><small style="color:var(--muted)">${esc(a.lastMessage || '')}</small>
      <div class="node-progress" style="margin-top:6px"><i style="width:${a.progress || 0}%"></i></div></div>
      <span class="badge ${a.status || ''}">${esc(a.status || 'idle')}</span></div>`;
  }).join('');

  const ev = (state.agents?.events || []).slice(0, 6);
  if (ev.length && $('logBox')) {
    $('logBox').innerHTML = ev.map(e => `<div>[${new Date(e.at).toLocaleTimeString('tr-TR')}] ${esc(e.message)}</div>`).join('');
  }
}

function getDisplayColumns() {
  const preferred = getSelectedFields().filter(f => !['businessId', 'firstSeenAt', 'lastSeenAt', 'sourceQuery', 'lat', 'lng'].includes(f));
  const cols = ['leadStatus', 'name', ...preferred.filter(f => !['leadStatus', 'name'].includes(f))];
  return [...new Set(cols)].slice(0, 10);
}

function renderLeads() {
  const q = ($('globalSearch')?.value || '').toLowerCase();
  const rows = (state.leads.main || []).filter(x => JSON.stringify(x).toLowerCase().includes(q));
  const cols = getDisplayColumns();
  $('leadHint').textContent = `${rows.length} lead`;
  $('leadHead').innerHTML = `<tr>${cols.map(c => `<th>${esc(FIELD_LABELS[c] || c)}</th>`).join('')}</tr>`;
  $('leadRows').innerHTML = rows.length
    ? rows.map(x => `<tr>${cols.map(c => {
      let v = x[c] ?? '-';
      if (c === 'leadStatus') v = `<span class="tag">${esc(x.leadStatus || 'new')}</span>`;
      else if (c === 'name') v = `<b>${esc(x.name)}</b>`;
      else if (c === 'website' && x.website) v = `<a href="${esc(x.website)}" target="_blank" style="color:var(--orange2)">site</a>`;
      else if (c === 'mapsLink' && x.mapsLink) v = `<a href="${esc(x.mapsLink)}" target="_blank" style="color:var(--orange2)">maps</a>`;
      else v = esc(v);
      return `<td>${v}</td>`;
    }).join('')}</tr>`).join('')
    : `<tr><td colspan="${cols.length}" style="color:var(--muted)">Henüz lead yok</td></tr>`;
}

function renderHistory() {
  const box = $('historyList');
  if (!box) return;
  const rows = state.leads.history || [];
  box.innerHTML = rows.length
    ? rows.map(h => `<div class="history-item ${h.status || 'ok'}">
      <div class="status-dot"></div>
      <div><b>${esc(new Date(h.finishedAt || h.startedAt).toLocaleString('tr-TR'))}</b>
      <br><small style="color:var(--muted)">${esc(h.found || 0)} bulundu · ${esc(h.output || h.enriched || 0)} çıktı · ${esc((h.fields || []).length)} alan</small></div>
      <span class="badge ${h.status === 'error' ? 'error' : 'done'}">${esc(h.status || 'ok')}</span></div>`).join('')
    : '<div style="color:var(--muted)">Henüz geçmiş yok</div>';
}

function renderServerLogs() {
  $('serverLogMeta').textContent = `${(state.serverLogs || []).length} satır`;
  $('serverLogs').innerHTML = (state.serverLogs || []).slice(0, 120).map(x =>
    `<div>[${new Date(x.at).toLocaleTimeString('tr-TR')}] ${esc(x.level)} ${esc(x.message)}</div>`
  ).join('') || '<div>Log yok</div>';
}

async function resyncSheets() {
  toast('Sheets sync başlatıldı');
  const r = await fetch('/api/resync-sheets', { method: 'POST' });
  const d = await r.json();
  if (!r.ok) { toast(d.error || 'Hata'); return; }
  toast('Sheets senkronlandı');
  refreshAll();
}

async function saveFields() {
  await fetch('/api/settings', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ lastFields: getSelectedFields() })
  });
  toast('Alan seçimi kaydedildi');
}

function populateSettingsForm() {
  const s = state.leads.settings || {};
  if ($('settingBaseUrl')) $('settingBaseUrl').value = s.openaiBaseUrl || '';
  if ($('settingApiKey')) $('settingApiKey').value = s.openaiApiKey || '';
  if ($('settingClassifier')) $('settingClassifier').value = s.modelClassifier || '';
  if ($('settingEnricher')) $('settingEnricher').value = s.modelEnricher || '';
}

async function saveSettingsForm() {
  const body = {
    openaiBaseUrl: $('settingBaseUrl').value.trim(),
    openaiApiKey: $('settingApiKey').value.trim(),
    modelClassifier: $('settingClassifier').value.trim(),
    modelEnricher: $('settingEnricher').value.trim()
  };
  const r = await fetch('/api/settings', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
  const d = await r.json();
  if (!r.ok) { toast(d.error || 'Ayarlar kaydedilemedi'); return; }
  toast('AI & OpenRouter ayarları kaydedildi');
  refreshAll();
}

function exportJson() {
  const blob = new Blob([JSON.stringify({ status: state.status, leads: state.leads, fields: getSelectedFields() }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'lead-radar-pro-export.json';
  a.click();
  URL.revokeObjectURL(a.href);
}

async function resetAll() {
  if ($('resetConfirm').value !== 'RESET') { toast('RESET yazmalısın'); return; }
  if (!confirm('Tüm veriler sıfırlansın mı?')) return;
  const r = await fetch('/api/reset-all', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ confirm: 'RESET' }) });
  const d = await r.json();
  if (!r.ok) { toast(d.error || 'Hata'); return; }
  toast('Sıfırlandı');
  $('resetConfirm').value = '';
  refreshAll();
}

function bindEvents() {
  window.addEventListener('hashchange', () => route());
  $('globalSearch')?.addEventListener('input', () => { renderLeads(); route('leads'); });
  $('btnQuickRun')?.addEventListener('click', runDiscovery);
  $('btnRunDiscovery')?.addEventListener('click', runDiscovery);
  $('btnExport')?.addEventListener('click', exportJson);
  $('btnSaveFields')?.addEventListener('click', saveFields);
  $('btnSaveSettings')?.addEventListener('click', saveSettingsForm);
  $('btnRefreshAgents')?.addEventListener('click', refreshAll);
  $('btnRefreshLeads')?.addEventListener('click', refreshAll);
  $('btnRefreshLogs')?.addEventListener('click', refreshAll);
  $('btnReset')?.addEventListener('click', resetAll);
  $('btnModalCancel')?.addEventListener('click', () => resolveRunChoice(null));
  document.querySelectorAll('[data-run-source]').forEach(btn => {
    btn.addEventListener('click', () => resolveRunChoice(btn.dataset.runSource));
  });
  $('runModal')?.addEventListener('click', e => { if (e.target?.id === 'runModal') resolveRunChoice(null); });
  document.querySelectorAll('[data-goto]').forEach(btn => {
    btn.addEventListener('click', () => route(btn.dataset.goto));
  });
  document.querySelectorAll('.nav-group-trigger').forEach(trigger => {
    trigger.addEventListener('click', () => {
      const group = trigger.closest('.nav-group');
      group.classList.toggle('open');
    });
  });
  window.addEventListener('keydown', e => { if (e.key === 'Escape' && pendingRunChoice) resolveRunChoice(null); });
}

function init() {
  bindEvents();
  renderMapToolbar();
  renderLocationPresets();
  renderPipelineBox();
  route();
  refreshAll().then(() => {
    renderFieldPresets();
    renderFieldToggles();
  });
  pollTimer = setInterval(refreshAll, 5000);
  icons();
}

init();
