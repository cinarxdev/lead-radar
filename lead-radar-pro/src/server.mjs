import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.mjs';
import { runDiscovery, resyncSheetsFromLocal } from './orchestrator.mjs';
import { snapshot, resetAllLocal, getSettings, saveSettings } from './store.mjs';
import { getRuntime, resetRuntime } from './runtime.mjs';
import { fieldCatalog } from './fields.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(path.resolve(__dirname, '..'), 'public');

let lastRun = null;
let running = false;
const logBuffer = [];
const logPath = path.join(config.dataDir, 'server.log');

function redactSecrets(text) {
  return String(text).replace(/sk-[A-Za-z0-9_-]{10,}/g, 'sk-***');
}

function stringifyLogArg(a) {
  if (typeof a === 'string') return a;
  if (a instanceof Error) return a.stack || a.message;
  try {
    return JSON.stringify(a);
  } catch {
    return String(a);
  }
}

function addLog(level, args) {
  const line = { at: new Date().toISOString(), level, message: redactSecrets(args.map(stringifyLogArg).join(' ')) };
  logBuffer.unshift(line);
  logBuffer.splice(400);
  try {
    fs.mkdirSync(config.dataDir, { recursive: true });
    fs.appendFileSync(logPath, `[${line.at}] ${level.toUpperCase()} ${line.message}\n`, 'utf8');
  } catch {}
}

for (const level of ['log', 'warn', 'error']) {
  const orig = console[level].bind(console);
  console[level] = (...args) => {
    addLog(level, args);
    try {
      orig(...args);
    } catch {}
  };
}

function send(res, code, data, type = 'application/json') {
  res.writeHead(code, { 'content-type': type });
  res.end(type === 'application/json' ? JSON.stringify(data, null, 2) : data);
}

async function body(req) {
  let s = '';
  for await (const c of req) s += c;
  return s ? JSON.parse(s) : {};
}

function serveStatic(res, filePath, contentType) {
  if (!fs.existsSync(filePath)) return send(res, 404, { error: 'not found' });
  send(res, 200, fs.readFileSync(filePath, 'utf8'), contentType);
}

const geocodePath = path.join(config.dataDir, 'geocode-cache.json');

function readGeocodeCache() {
  try {
    return fs.existsSync(geocodePath) ? JSON.parse(fs.readFileSync(geocodePath, 'utf8')) : {};
  } catch {
    return {};
  }
}

function writeGeocodeCache(cache) {
  fs.mkdirSync(config.dataDir, { recursive: true });
  fs.writeFileSync(geocodePath, JSON.stringify(cache, null, 2), 'utf8');
}

async function geocodeAddress(q) {
  const query = String(q || '').trim();
  if (!query) return { error: 'empty query' };
  const cache = readGeocodeCache();
  const key = query.toLocaleLowerCase('tr-TR');
  if (cache[key]) return { ...cache[key], cached: true };
  const u = new URL('https://nominatim.openstreetmap.org/search');
  u.searchParams.set('format', 'jsonv2');
  u.searchParams.set('limit', '1');
  u.searchParams.set('countrycodes', 'tr');
  u.searchParams.set('q', query);
  const r = await fetch(u, { headers: { 'user-agent': 'lead-radar-pro/1.0', accept: 'application/json' } });
  if (!r.ok) {
    const result = { error: 'geocode_unavailable', status: r.status };
    cache[key] = result;
    writeGeocodeCache(cache);
    return result;
  }
  const rows = await r.json();
  const first = rows?.[0];
  const result = first
    ? { lat: Number(first.lat), lng: Number(first.lon), displayName: first.display_name, source: 'nominatim' }
    : { error: 'not_found' };
  cache[key] = result;
  writeGeocodeCache(cache);
  return result;
}

async function resetEverything() {
  if (running) throw new Error('Run çalışırken reset yapılamaz');
  resetAllLocal();
  resetRuntime('Sistem sıfırlandı');
  lastRun = null;
  let sheets = { skipped: true, reason: 'Sheets integration removed' };
  return { status: 'reset', sheets };
}

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8'
};

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (req.method === 'GET' && url.pathname === '/') return serveStatic(res, path.join(publicDir, 'index.html'), mime['.html']);
    if (req.method === 'GET' && url.pathname.startsWith('/assets/')) {
      const rel = url.pathname.replace('/assets/', '');
      const fp = path.join(publicDir, rel);
      const ext = path.extname(fp);
      return serveStatic(res, fp, mime[ext] || 'application/octet-stream');
    }
    if (req.method === 'GET' && url.pathname === '/api/status') {
      const runtime = getRuntime();
      if (running && runtime.running === false) running = false;
      return send(res, 200, {
        running: Boolean(running || runtime.running),
        lastRun,
        runtime,
        config: {
          hasLocalScraper: fs.existsSync(config.scraperExe),
          baseUrl: getSettings().openaiBaseUrl || config.baseUrl,
          hasModelApiKey: Boolean(config.apiKey || getSettings().openaiApiKey),
          port: config.port
        }
      });
    }
    if (req.method === 'GET' && url.pathname === '/api/fields') return send(res, 200, fieldCatalog());
    if (req.method === 'GET' && url.pathname === '/api/settings') return send(res, 200, getSettings());
    if (req.method === 'POST' && url.pathname === '/api/settings') {
      const patch = await body(req);
      return send(res, 200, saveSettings(patch));
    }
    if (req.method === 'GET' && url.pathname === '/api/agents') return send(res, 200, getRuntime());
    if (req.method === 'GET' && url.pathname === '/api/leads') return send(res, 200, snapshot());
    if (req.method === 'GET' && url.pathname === '/api/logs') return send(res, 200, { logs: logBuffer, logPath, running, lastRun });
    if (req.method === 'GET' && url.pathname === '/api/geocode') {
      const result = await geocodeAddress(url.searchParams.get('q'));
      return send(res, result.error && result.error !== 'not_found' ? 400 : 200, result);
    }
    if (req.method === 'POST' && url.pathname === '/api/resync-sheets') {
      return send(res, 200, await resyncSheetsFromLocal());
    }
    if (req.method === 'POST' && url.pathname === '/api/reset-all') {
      const request = await body(req);
      if (request.confirm !== 'RESET') return send(res, 400, { error: 'confirm alanı RESET olmalı' });
      return send(res, 200, await resetEverything());
    }
    if (req.method === 'POST' && url.pathname === '/api/run') {
      const runtime = getRuntime();
      if (running && runtime.running === false) running = false;
      if (running || runtime.running) return send(res, 409, { error: 'Zaten çalışıyor' });
      running = true;
      lastRun = { status: 'running', startedAt: new Date().toISOString() };
      const params = await body(req);
      runDiscovery(params)
        .then(r => { lastRun = { status: 'ok', ...r }; })
        .catch(e => { lastRun = { status: 'error', error: e.message, finishedAt: new Date().toISOString() }; })
        .finally(() => { running = false; });
      return send(res, 202, { accepted: true, lastRun });
    }
    send(res, 404, { error: 'not found' });
  } catch (e) {
    send(res, 500, { error: e.message });
  }
});

server.listen(config.port, () => console.log(`Lead Radar Pro: http://localhost:${config.port}`));
