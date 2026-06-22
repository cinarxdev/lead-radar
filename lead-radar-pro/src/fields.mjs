export const FIELD_GROUPS = [
  { id: 'core', label: 'Temel Bilgiler' },
  { id: 'contact', label: 'İletişim' },
  { id: 'social', label: 'Dijital Varlık' },
  { id: 'metrics', label: 'Metrikler' },
  { id: 'location', label: 'Konum' },
  { id: 'meta', label: 'Meta & Skor' }
];

export const SCRAPE_FIELDS = {
  name: { label: 'İşletme Adı', group: 'core', locked: true },
  category: { label: 'Kategori', group: 'core' },
  businessId: { label: 'İşletme ID', group: 'core' },
  phone: { label: 'Telefon', group: 'contact' },
  website: { label: 'Web Sitesi', group: 'contact' },
  address: { label: 'Adres', group: 'location' },
  district: { label: 'İlçe / Bölge', group: 'location' },
  lat: { label: 'Enlem', group: 'location' },
  lng: { label: 'Boylam', group: 'location' },
  mapsLink: { label: 'Google Maps Linki', group: 'social' },
  instagram: { label: 'Instagram', group: 'social' },
  rating: { label: 'Puan', group: 'metrics' },
  reviewsCount: { label: 'Yorum Sayısı', group: 'metrics' },
  priceRange: { label: 'Fiyat Aralığı', group: 'metrics' },
  openingHours: { label: 'Çalışma Saatleri', group: 'metrics' },
  freshnessScore: { label: 'Yenilik Skoru', group: 'meta' },
  leadQuality: { label: 'Lead Kalitesi', group: 'meta' },
  aiNote: { label: 'AI Notu', group: 'meta' },
  platformPresence: { label: 'Platform Sinyali', group: 'meta' },
  menuSummary: { label: 'Menü Özeti', group: 'meta' },
  sourceQuery: { label: 'Kaynak Sorgu', group: 'meta' },
  firstSeenAt: { label: 'İlk Görülme', group: 'meta' },
  lastSeenAt: { label: 'Son Görülme', group: 'meta' }
};

export const FIELD_PRESETS = {
  minimal: ['name', 'phone', 'address', 'category', 'mapsLink', 'freshnessScore'],
  sales: ['name', 'phone', 'website', 'instagram', 'category', 'address', 'rating', 'reviewsCount', 'freshnessScore', 'leadQuality', 'aiNote', 'mapsLink'],
  full: Object.keys(SCRAPE_FIELDS),
  location: ['name', 'address', 'district', 'lat', 'lng', 'phone', 'category', 'mapsLink', 'freshnessScore']
};

export function normalizeFieldSelection(input) {
  const all = Object.keys(SCRAPE_FIELDS);
  if (!input || typeof input !== 'object') return [...all];
  const selected = Object.entries(input).filter(([, v]) => v === true).map(([k]) => k);
  const locked = Object.entries(SCRAPE_FIELDS).filter(([, m]) => m.locked).map(([k]) => k);
  const merged = [...new Set([...locked, ...selected])];
  return merged.filter(k => all.includes(k));
}

export function applyFieldMask(lead, fields) {
  const out = {};
  for (const key of fields) {
    if (key in lead) out[key] = lead[key];
  }
  if (!out.businessId && lead.businessId) out.businessId = lead.businessId;
  if (!out.name && lead.name) out.name = lead.name;
  return out;
}

export function fieldCatalog() {
  return {
    groups: FIELD_GROUPS,
    fields: SCRAPE_FIELDS,
    presets: FIELD_PRESETS
  };
}
