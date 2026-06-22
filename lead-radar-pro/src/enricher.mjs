import { config, models } from './config.mjs';
import { setAgent, markAgentError } from './runtime.mjs';
import { getSettings } from './store.mjs';

function extractJsonText(text) {
  const raw = String(text || '').trim();
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (fenced ? fenced[1] : raw).trim();
}

function parseMaybeJson(text, fallback = {}) {
  try {
    return JSON.parse(extractJsonText(text));
  } catch {
    return fallback;
  }
}

async function llm(model, system, user) {
  const settings = getSettings();
  const baseUrl = settings.openaiBaseUrl || config.baseUrl;
  const apiKey = settings.openaiApiKey || config.apiKey;

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'authorization': `Bearer ${apiKey}`,
      'accept': 'application/json',
      'HTTP-Referer': 'https://github.com/lead-radar-pro',
      'X-Title': 'Lead Radar Pro'
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      temperature: 0.2,
      stream: false,
      response_format: { type: 'json_object' }
    })
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`LLM ${model} HTTP ${res.status} - ${text.slice(0, 200)}`);
  const data = JSON.parse(text);
  return data.choices?.[0]?.message?.content || '';
}

export async function enrichLead(lead, idx, total, wantsAi) {
  if (!wantsAi) {
    return {
      ...lead,
      platformPresence: inferPlatform(lead),
      menuSummary: inferMenu(lead)
    };
  }
  const pct = Math.round(((idx + 1) / Math.max(total, 1)) * 100);
  setAgent('enricher', 'running', pct, `${idx + 1}/${total}: ${lead.name}`);
  const system = 'Sen B2B lead zenginleştirme motorusun. Türkçe, kısa, yalnız JSON döndür.';
  const user = `JSON şeması: {"aiNote":"1-2 cümle","leadQuality":0-10,"recommendedNextAction":"kısa aksiyon","platformPresence":"platform notu","menuSummary":"menü notu"}\n${JSON.stringify(lead)}`;
  try {
    const settings = getSettings();
    const modelClassifier = settings.modelClassifier || models.classifier;
    const parsed = parseMaybeJson(await llm(modelClassifier, system, user), {});
    return {
      ...lead,
      aiNote: parsed.aiNote || '',
      leadQuality: parsed.leadQuality ?? '',
      recommendedNextAction: parsed.recommendedNextAction || '',
      platformPresence: parsed.platformPresence || inferPlatform(lead),
      menuSummary: parsed.menuSummary || inferMenu(lead)
    };
  } catch (e) {
    markAgentError('enricher', e);
    return {
      ...lead,
      aiNote: `AI hata: ${String(e.message || e).slice(0, 100)}`,
      leadQuality: '',
      platformPresence: inferPlatform(lead),
      menuSummary: inferMenu(lead)
    };
  }
}

function inferPlatform(lead) {
  const hay = `${lead.name} ${lead.category}`.toLocaleLowerCase('tr-TR');
  const likely = /restaurant|restoran|kafe|cafe|tatlı|pastane|kahve|dondurma|köfte|kebap/.test(hay);
  return likely ? 'Yemeksepeti, Trendyol Go, GetirYemek araştırılmalı' : 'Manuel platform kontrolü';
}

function inferMenu(lead) {
  const cat = String(lead.category || '').toLocaleLowerCase('tr-TR');
  if (cat.includes('kahve') || cat.includes('kafe')) return 'İçecek ve atıştırmalık odaklı QR menü adayı';
  if (cat.includes('tatlı') || cat.includes('pastane')) return 'Görsel ürün kataloğu ihtiyacı yüksek';
  if (cat.includes('restoran')) return 'Kategori bazlı dijital menü satışı uygun';
  return 'Genel yiyecek/içecek QR menü adayı';
}

export async function enrichBatch(leads, options = {}) {
  const wantsAi = options.enableAi !== false;
  const wantsMeta = (options.fields || []).some(f => ['aiNote', 'leadQuality', 'platformPresence', 'menuSummary'].includes(f));
  if (!leads.length) return [];
  if (!wantsMeta) return leads.map(l => ({ ...l, platformPresence: inferPlatform(l), menuSummary: inferMenu(l) }));
  const concurrency = Math.min(4, Number(options.concurrency || 3));
  setAgent('enricher', 'running', 1, `${leads.length} lead zenginleştiriliyor`);
  const out = [];
  let i = 0;
  async function worker() {
    while (i < leads.length) {
      const idx = i++;
      out[idx] = await enrichLead(leads[idx], idx, leads.length, wantsAi);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, leads.length) }, worker));
  setAgent('enricher', 'done', 100, `${leads.length} lead zenginleştirildi`);
  return out;
}
