import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.mjs';

const researchPath = path.join(config.dataDir, 'research-db.json');
const mainPath = path.join(config.dataDir, 'main-active.json');
const settingsPath = path.join(config.dataDir, 'settings.json');
const historyPath = path.join(config.dataDir, 'run-history.json');

function readJson(p, fallback) {
  try {
    return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(p, data) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf8');
}

export function getSettings() {
  return readJson(settingsPath, { lastFields: null, lastParams: null });
}

export function saveSettings(patch) {
  const current = getSettings();
  const next = { ...current, ...patch, updatedAt: new Date().toISOString() };
  writeJson(settingsPath, next);
  return next;
}

export function appendRunHistory(entry) {
  const rows = readJson(historyPath, []);
  rows.unshift({ id: `run-${Date.now()}`, ...entry });
  writeJson(historyPath, rows.slice(0, 100));
  return rows[0];
}

export function getRunHistory() {
  return readJson(historyPath, []);
}

export function upsertResearch(leads) {
  const existing = readJson(researchPath, []);
  const byId = new Map(existing.map(x => [x.businessId, x]));
  const newIds = [];
  const updatedIds = [];
  for (const lead of leads) {
    const old = byId.get(lead.businessId);
    if (old) {
      byId.set(lead.businessId, { ...old, ...lead, firstSeenAt: old.firstSeenAt, lastSeenAt: new Date().toISOString() });
      updatedIds.push(lead.businessId);
    } else {
      byId.set(lead.businessId, lead);
      newIds.push(lead.businessId);
    }
  }
  const all = [...byId.values()];
  writeJson(researchPath, all);
  all.newIds = newIds;
  all.updatedIds = updatedIds;
  return all;
}

export function syncMain(leads, options = {}) {
  const current = readJson(mainPath, []);
  const contacted = new Set(current.filter(x => x.contacted === true || String(x.contacted).toLowerCase() === 'true' || x.leadStatus === 'contacted').map(x => x.businessId));
  const currentIds = new Set(current.map(x => x.businessId));
  let mode = options.mode || 'new-only';
  if (mode === 'replace') mode = 'replace-active';
  const maxMain = Number(options.maxMain || 0);
  let base = mode === 'replace-active' ? [] : current.filter(x => !contacted.has(x.businessId));
  const baseIds = new Set(base.map(x => x.businessId));
  let additions = leads.filter(x => !contacted.has(x.businessId));
  if (mode === 'new-only') additions = additions.filter(x => !currentIds.has(x.businessId) && !baseIds.has(x.businessId));
  if (mode === 'include-existing') additions = additions.filter(x => !baseIds.has(x.businessId));
  let next = [...base, ...additions];
  if (maxMain > 0) next = next.slice(0, maxMain);
  writeJson(mainPath, next);
  next.addedCount = additions.length;
  next.removedContactedCount = current.length - base.length;
  return next;
}

export function snapshot() {
  return {
    research: readJson(researchPath, []),
    main: readJson(mainPath, []),
    settings: getSettings(),
    history: getRunHistory()
  };
}

export function resetAllLocal() {
  writeJson(mainPath, []);
  writeJson(researchPath, []);
  writeJson(historyPath, []);
  return { status: 'reset' };
}
