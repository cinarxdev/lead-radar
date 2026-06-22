import { scrapeRegion, resolveGeoCenter } from './scraper.mjs';
import { enrichBatch } from './enricher.mjs';
import { syncMain, upsertResearch, snapshot, saveSettings, appendRunHistory } from './store.mjs';
import { normalizeFieldSelection, applyFieldMask } from './fields.mjs';
import { config } from './config.mjs';
import { beginRun, finishRun, setAgent, markAgentError } from './runtime.mjs';

function num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function applyLeadFilters(leads, params = {}) {
  const minFreshness = num(params.minFreshness, 0);
  const maxReviews = num(params.maxReviews, 0);
  const maxFinalLeads = num(params.maxFinalLeads, 0);
  const sortBy = params.sortBy || 'freshness-desc';
  let out = leads.filter(x => num(x.freshnessScore, 0) >= minFreshness);
  if (maxReviews > 0) out = out.filter(x => num(x.reviewsCount, 0) <= maxReviews);
  if (params.requirePhone) out = out.filter(x => Boolean(x.phone));
  if (params.requireWebsite) out = out.filter(x => Boolean(x.website));
  out.sort((a, b) => {
    if (sortBy === 'reviews-asc') return num(a.reviewsCount, 999999) - num(b.reviewsCount, 999999);
    if (sortBy === 'rating-desc') return num(b.rating, 0) - num(a.rating, 0);
    if (sortBy === 'name-asc') return String(a.name).localeCompare(String(b.name), 'tr');
    return num(b.freshnessScore, 0) - num(a.freshnessScore, 0);
  });
  if (maxFinalLeads > 0) out = out.slice(0, maxFinalLeads);
  return out;
}

function maskLeads(leads, fields) {
  return leads.map(lead => applyFieldMask(lead, fields));
}

export async function runDiscovery(params = {}) {
  const fields = normalizeFieldSelection(params.fields);
  beginRun(params, fields);
  const startedAt = new Date().toISOString();
  try {
    setAgent('orchestrator', 'running', 5, 'Parametreler doğrulandı');
    saveSettings({ lastFields: fields, lastParams: params });

    setAgent('geo-router', 'running', 20, 'Bölge merkezi hesaplanıyor');
    const center = resolveGeoCenter(params);
    setAgent('geo-router', 'done', 100, `${center.label} · ${Math.round(center.radius)}m · ${center.lat.toFixed(4)}, ${center.lng.toFixed(4)}`);

    setAgent('maps-scraper', 'running', 10, 'Maps scraper başlatıldı');
    let jobIndex = 0;
    const rawLeads = await scrapeRegion(params, (job) => {
      jobIndex++;
      const pct = Math.min(85, 10 + jobIndex * 8);
      setAgent('maps-scraper', 'running', pct, `Sorgu: ${job.query}`);
    });
    setAgent('maps-scraper', 'done', 100, `${rawLeads.length} ham kayıt toplandı`);

    setAgent('lead-cleaner', 'running', 30, 'Dedupe ve filtreler uygulanıyor');
    const unique = [...new Map(rawLeads.map(x => [x.businessId, x])).values()];
    const district = String(params.district || '').toLocaleLowerCase('tr-TR');
    const neighborhoods = (params.neighborhoods || []).map(x => String(x).toLocaleLowerCase('tr-TR')).filter(Boolean);
    const scoped = params.geoArea ? unique : (district ? unique.filter(x => {
      const hay = `${x.district || ''} ${x.address || ''} ${x.sourceQuery || ''}`.toLocaleLowerCase('tr-TR');
      return hay.includes(district) || neighborhoods.some(n => hay.includes(n));
    }) : unique);
    const scopedOrFallback = scoped.length ? scoped : unique;
    const candidates = applyLeadFilters(scopedOrFallback, params);
    setAgent('lead-cleaner', 'done', 100, `${unique.length} benzersiz · ${candidates.length} aday`);

    const enriched = await enrichBatch(candidates, {
      fields,
      enableAi: params.enableAi !== false,
      concurrency: params.concurrency || 3
    });

    setAgent('field-filter', 'running', 60, `${fields.length} alan maskesi uygulanıyor`);
    const masked = maskLeads(enriched, fields);
    setAgent('field-filter', 'done', 100, `Çıktı alanları: ${fields.join(', ')}`);

    setAgent('orchestrator', 'running', 75, 'Research DB ve Main senkronu');
    const before = snapshot();
    const existingResearchIds = new Set(before.research.map(x => x.businessId));
    const research = upsertResearch(masked);
    const mainMode = params.mainMode || 'new-only';
    let mainCandidates = masked;
    if (mainMode === 'new-only') mainCandidates = masked.filter(x => !existingResearchIds.has(x.businessId));
    if (!mainCandidates.length && params.addExistingIfNoNew === true) mainCandidates = masked;
    const main = syncMain(mainCandidates, { mode: mainMode, maxMain: params.maxMain });

    const missingPhone = masked.filter(x => !x.phone).length;
    setAgent('qa-auditor', 'done', 100, `QA: telefon eksik ${missingPhone}, yüksek skor ${masked.filter(x => num(x.freshnessScore) >= 7).length}`);

    const result = {
      startedAt,
      finishedAt: new Date().toISOString(),
      fields,
      geoCenter: center,
      found: rawLeads.length,
      unique: unique.length,
      scoped: scopedOrFallback.length,
      filtered: candidates.length,
      enriched: enriched.length,
      output: masked.length,
      newResearch: research.newIds?.length || 0,
      mainAdded: main.addedCount || 0,
      researchCount: research.length,
      mainCount: main.length,
      sheets: { skipped: true }
    };

    appendRunHistory({ ...result, status: 'ok', params: { district: params.district, neighborhoods: params.neighborhoods, searchTerms: params.searchTerms } });
    finishRun(true, `Tamamlandı: ${masked.length} kayıt · ${fields.length} alan`);
    return result;
  } catch (e) {
    appendRunHistory({ startedAt, finishedAt: new Date().toISOString(), status: 'error', error: e.message });
    const msg = e.message || String(e);
    if (msg.includes('Scraper') || msg.includes('Maps')) markAgentError('maps-scraper', e);
    markAgentError('orchestrator', e);
    finishRun(false, msg);
    throw e;
  }
}

export async function resyncSheetsFromLocal() {
  return { skipped: true, reason: 'Sheets integration removed' };
}
