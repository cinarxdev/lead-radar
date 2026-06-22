import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { config } from './config.mjs';
import { normalizePlace } from './scoring.mjs';

const districtCenters = {
  'kadıköy': { lat: 40.9900, lng: 29.0300, zoom: 14, radius: 3500 },
  'kadikoy': { lat: 40.9900, lng: 29.0300, zoom: 14, radius: 3500 },
  'moda': { lat: 40.9869, lng: 29.0252, zoom: 15, radius: 1200 },
  'beşiktaş': { lat: 41.0438, lng: 29.0086, zoom: 14, radius: 3500 },
  'besiktas': { lat: 41.0438, lng: 29.0086, zoom: 14, radius: 3500 },
  'şişli': { lat: 41.0602, lng: 28.9877, zoom: 14, radius: 3500 },
  'sisli': { lat: 41.0602, lng: 28.9877, zoom: 14, radius: 3500 },
  'beyoğlu': { lat: 41.0369, lng: 28.9774, zoom: 14, radius: 3500 },
  'beyoglu': { lat: 41.0369, lng: 28.9774, zoom: 14, radius: 3500 },
  'üsküdar': { lat: 41.0255, lng: 29.0156, zoom: 14, radius: 3500 },
  'uskudar': { lat: 41.0255, lng: 29.0156, zoom: 14, radius: 3500 },
  'kartal': { lat: 40.8919, lng: 29.1882, zoom: 14, radius: 3500 },
  'pendik': { lat: 40.8797, lng: 29.2581, zoom: 14, radius: 3500 },
  'ataşehir': { lat: 40.9929, lng: 29.1244, zoom: 14, radius: 3500 },
  'atasehir': { lat: 40.9929, lng: 29.1244, zoom: 14, radius: 3500 },
  'bakırköy': { lat: 40.9783, lng: 28.8724, zoom: 14, radius: 3500 },
  'bakirkoy': { lat: 40.9783, lng: 28.8724, zoom: 14, radius: 3500 },
  'fatih': { lat: 41.0186, lng: 28.9397, zoom: 14, radius: 3500 },
  'sarıyer': { lat: 41.1663, lng: 29.0572, zoom: 13, radius: 6000 },
  'sariyer': { lat: 41.1663, lng: 29.0572, zoom: 13, radius: 6000 },
  'istanbul': { lat: 41.0082, lng: 28.9784, zoom: 12, radius: 8000 }
};

function trKey(v) {
  return String(v || '').trim().toLocaleLowerCase('tr-TR')
    .replaceAll('ı', 'i').replaceAll('ğ', 'g').replaceAll('ü', 'u').replaceAll('ş', 's').replaceAll('ö', 'o').replaceAll('ç', 'c');
}

function knownCenter(label) {
  return districtCenters[String(label || '').toLocaleLowerCase('tr-TR')] || districtCenters[trKey(label)];
}

function validNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function centerFromGeo(geoArea, district, neighborhoods = []) {
  if (geoArea?.mode === 'circle' && geoArea.center) {
    const lat = validNum(geoArea.center.lat);
    const lng = validNum(geoArea.center.lng);
    if (lat !== null && lng !== null) {
      const radius = Math.max(200, Math.min(Number(geoArea.radius || 2500), 15000));
      return { lat, lng, radius, zoom: radius <= 1200 ? 15 : radius <= 4000 ? 14 : 13, label: 'harita dairesi' };
    }
  }
  if (geoArea?.mode === 'polygon' && Array.isArray(geoArea.polygon) && geoArea.polygon.length >= 3) {
    const pts = geoArea.polygon.map(p => ({ lat: validNum(p.lat), lng: validNum(p.lng) })).filter(p => p.lat !== null && p.lng !== null);
    if (pts.length) {
      const lat = pts.reduce((s, p) => s + p.lat, 0) / pts.length;
      const lng = pts.reduce((s, p) => s + p.lng, 0) / pts.length;
      const maxDist = Math.max(...pts.map(p => Math.hypot(p.lat - lat, p.lng - lng))) * 111000;
      return { lat, lng, radius: Math.max(500, Math.min(maxDist * 1.5, 12000)), zoom: 14, label: 'harita poligonu' };
    }
  }
  for (const n of neighborhoods) {
    const c = knownCenter(n);
    if (c) return { ...c, label: n };
  }
  const c = knownCenter(district) || districtCenters.istanbul;
  return { ...c, label: district || 'İstanbul' };
}

function centerForLocation(location, fallback) {
  return { ...(knownCenter(location) || fallback), label: location || fallback.label };
}

function runScraper(args, timeoutMs = 300000) {
  return new Promise((resolve, reject) => {
    execFile(config.scraperExe, args, {
      cwd: config.monorepoRoot,
      timeout: timeoutMs,
      windowsHide: true,
      env: { ...process.env, DISABLE_TELEMETRY: '1' }
    }, (err, stdout, stderr) => {
      if (err) {
        err.message = `Maps Scraper hata: ${err.message}\n${stdout || ''}\n${stderr || ''}`.slice(0, 4000);
        reject(err);
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

function parseScraperResults(raw) {
  const text = String(raw || '').trim();
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch (firstError) {
    const rows = [];
    for (const line of text.split(/\r?\n/).map(x => x.trim()).filter(Boolean)) {
      try {
        const parsed = JSON.parse(line);
        if (Array.isArray(parsed)) rows.push(...parsed);
        else rows.push(parsed);
      } catch (lineError) {
        throw new Error(`Scraper JSON okunamadı: ${firstError.message}`);
      }
    }
    return rows;
  }
}

function toScraperPlace(x) {
  const lat = Number(x.latitude ?? x.lat);
  const lng = Number(x.longitude ?? x.longtitude ?? x.lng);
  const coordLink = Number.isFinite(lat) && Number.isFinite(lng) ? `https://www.google.com/maps/search/?api=1&query=${lat},${lng}` : '';
  return {
    ...x,
    title: x.title || x.name || '',
    category: x.category || (Array.isArray(x.categories) ? x.categories.join(', ') : ''),
    website: x.website || x.web_site || '',
    phone: x.phone || '',
    reviewCount: x.review_count ?? x.reviewCount ?? x.reviewsCount ?? '',
    rating: x.review_rating ?? x.rating ?? x.totalScore ?? '',
    priceRange: x.price_range || '',
    openingHours: x.open_hours || x.openingHours || '',
    longitude: lng,
    latitude: lat,
    url: x.link || coordLink,
    place_id: x.place_id || x.data_id || x.cid || ''
  };
}

function dedupe(leads) {
  const out = [];
  const seen = new Set();
  for (const lead of leads) {
    const key = lead.businessId;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(lead);
  }
  return out;
}

function makeJobs({ searchTerms, limit, district, neighborhoods, geoArea }) {
  const terms = searchTerms.filter(Boolean);
  const fallback = centerFromGeo(geoArea, district, neighborhoods);
  if (geoArea) {
    return terms.map(term => ({
      query: `${term} İstanbul`.replace(/\s+/g, ' ').trim(),
      center: fallback,
      perQueryLimit: limit,
      label: fallback.label
    }));
  }
  const locs = neighborhoods.length ? neighborhoods : [district || fallback.label || 'İstanbul'];
  return terms.flatMap(term => locs.map(loc => ({
    query: `${term} ${loc} İstanbul`.replace(/\s+/g, ' ').trim(),
    center: centerForLocation(loc, fallback),
    perQueryLimit: limit,
    label: loc
  }))).slice(0, 50);
}

async function scrapeOneJob(job, index, onProgress) {
  const stamp = `${Date.now()}-${index}`;
  const inputFile = path.join(config.dataDir, 'scraper', `gmaps-${stamp}-query.txt`);
  const resultsFile = path.join(config.dataDir, 'scraper', `gmaps-${stamp}-results.json`);
  fs.mkdirSync(path.dirname(inputFile), { recursive: true });
  fs.writeFileSync(inputFile, job.query + '\n', 'utf8');
  const c = job.center;
  const args = [
    '-input', inputFile,
    '-results', resultsFile,
    '-json',
    '-depth', '1',
    '-c', '1',
    '-lang', 'tr',
    '-fast-mode',
    '-geo', `${c.lat},${c.lng}`,
    '-zoom', String(c.zoom || 14),
    '-radius', String(Math.max(200, Math.min(Number(c.radius || 3000), 15000))),
    '-exit-on-inactivity', '90s'
  ];
  if (onProgress) onProgress(job, index);
  await runScraper(args);
  if (!fs.existsSync(resultsFile)) return [];
  const rows = parseScraperResults(fs.readFileSync(resultsFile, 'utf8'));
  return rows.slice(0, Math.max(1, Number(job.perQueryLimit || 20))).map(x => normalizePlace(toScraperPlace(x), `${job.query} @ ${job.label}`));
}

export async function scrapeRegion(params = {}, onProgress) {
  if (!fs.existsSync(config.scraperExe)) {
    throw new Error(`Maps Scraper binary bulunamadı: ${config.scraperExe}`);
  }
  const safeLimit = Math.max(1, Math.min(Number(params.limit || 20), 80));
  const jobs = makeJobs({
    searchTerms: params.searchTerms || ['cafe', 'restaurant', 'tatlıcı'],
    limit: safeLimit,
    district: params.district || '',
    neighborhoods: params.neighborhoods || [],
    geoArea: params.geoArea || null
  });
  if (!jobs.length) throw new Error('Arama sorgusu üretilemedi');
  const all = [];
  for (let i = 0; i < jobs.length; i++) {
    all.push(...await scrapeOneJob(jobs[i], i, onProgress));
  }
  return dedupe(all);
}

export function resolveGeoCenter(params) {
  return centerFromGeo(params.geoArea, params.district, params.neighborhoods || []);
}
