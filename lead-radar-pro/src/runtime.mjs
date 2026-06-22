import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.mjs';

const runtimePath = path.join(config.dataDir, 'runtime-status.json');

const baseAgents = [
  { id: 'orchestrator', name: 'Orchestrator', model: 'cx/gpt-5.5', role: 'Akış yönetimi ve parametre doğrulama', status: 'idle', progress: 0, lastMessage: 'Beklemede' },
  { id: 'geo-router', name: 'Geo Router', model: 'local', role: 'Harita bölgesi ve lokasyon çözümleme', status: 'idle', progress: 0, lastMessage: 'Beklemede' },
  { id: 'maps-scraper', name: 'Maps Scraper', model: 'gosom/google-maps-scraper', role: 'İşaretlenen bölgeden Google Maps verisi', status: 'idle', progress: 0, lastMessage: 'Beklemede' },
  { id: 'field-filter', name: 'Field Filter', model: 'local', role: 'Panelden seçilen alanları uygular', status: 'idle', progress: 0, lastMessage: 'Beklemede' },
  { id: 'lead-cleaner', name: 'Lead Cleaner', model: 'local', role: 'Dedupe, kapsam ve skor filtreleri', status: 'idle', progress: 0, lastMessage: 'Beklemede' },
  { id: 'enricher', name: 'AI Enricher', model: 'ag/gemini-3.5-flash-low', role: 'Lead kalite ve satış notu üretimi', status: 'idle', progress: 0, lastMessage: 'Beklemede' },
  { id: 'sheets-sync', name: 'Sheets Sync', model: 'google-sheets-api', role: 'Main ve Research DB senkronu', status: 'idle', progress: 0, lastMessage: 'Beklemede' },
  { id: 'qa-auditor', name: 'QA Auditor', model: 'local', role: 'Çıktı kalite denetimi', status: 'idle', progress: 0, lastMessage: 'Beklemede' }
];

let runtime = { running: false, runId: null, startedAt: null, finishedAt: null, agents: baseAgents, events: [], activeFields: [] };

function save() {
  fs.mkdirSync(config.dataDir, { recursive: true });
  fs.writeFileSync(runtimePath, JSON.stringify(runtime, null, 2), 'utf8');
}

function event(message, agentId = 'orchestrator') {
  runtime.events.unshift({ at: new Date().toISOString(), agentId, message });
  runtime.events = runtime.events.slice(0, 250);
  save();
}

export function getRuntime() {
  if (fs.existsSync(runtimePath)) {
    try {
      runtime = JSON.parse(fs.readFileSync(runtimePath, 'utf8'));
    } catch {}
  }
  return runtime;
}

export function resetRuntime(message = 'Runtime sıfırlandı') {
  runtime = {
    running: false,
    runId: null,
    startedAt: null,
    finishedAt: new Date().toISOString(),
    agents: baseAgents.map(a => ({ ...a })),
    events: [],
    activeFields: []
  };
  event(message);
  return runtime;
}

export function beginRun(params, fields = []) {
  runtime = {
    running: true,
    runId: `run-${Date.now()}`,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    params,
    activeFields: fields,
    agents: baseAgents.map(a => ({ ...a, status: 'idle', progress: 0, lastMessage: 'Beklemede' })),
    events: []
  };
  event(`Run başlatıldı · ${fields.length} alan seçili`);
  save();
  return runtime.runId;
}

export function finishRun(ok = true, message = '') {
  runtime.running = false;
  runtime.finishedAt = new Date().toISOString();
  setAgent('orchestrator', ok ? 'done' : 'error', 100, message || (ok ? 'Run tamamlandı' : 'Run hata ile bitti'));
  event(message || (ok ? 'Run tamamlandı' : 'Run hata ile bitti'));
  save();
}

export function setAgent(id, status, progress, message, extra = {}) {
  const a = runtime.agents.find(x => x.id === id);
  if (!a) return;
  Object.assign(a, extra, { status, progress, lastMessage: message, updatedAt: new Date().toISOString() });
  event(`${a.name}: ${message}`, id);
}

export function markAgentError(id, error) {
  setAgent(id, 'error', 100, error?.message || String(error));
}
