export function stableBusinessId(place) {
  return String(place.placeId || place.place_id || place.cid || place.url || `${place.title || place.name}|${place.address || ''}`)
    .toLowerCase()
    .replace(/[^a-z0-9ğüşöçıİĞÜŞÖÇ]+/gi, '-')
    .slice(0, 160);
}

export function freshnessScore(place) {
  const reviews = Number(place.reviewsCount ?? place.reviewCount ?? place.reviews ?? 0);
  const rating = Number(place.totalScore ?? place.rating ?? 0);
  let score = 5;
  if (reviews <= 3) score += 3.0;
  else if (reviews <= 10) score += 2.2;
  else if (reviews <= 25) score += 1.2;
  else if (reviews > 100) score -= 2.0;
  if (rating >= 4.7 && reviews <= 30) score += 0.8;
  if (place.website) score += 0.3;
  const text = JSON.stringify(place).toLowerCase();
  if (text.includes('new') || text.includes('yeni') || text.includes('grand opening') || text.includes('soft opening')) score += 1.5;
  return Math.max(0, Math.min(10, Math.round(score * 10) / 10));
}

function firstCoord(...vals) {
  for (const v of vals) {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return '';
}

export function normalizePlace(place, sourceQuery = '') {
  const id = stableBusinessId(place);
  const name = place.title || place.name || place.businessName || '';
  const mapsLink = place.url || place.googleMapsUrl || place.link || '';
  const lat = firstCoord(place.lat, place.latitude, place.location?.lat, place.location?.latitude, place.coordinates?.lat, place.coordinates?.latitude);
  const lng = firstCoord(place.lng, place.lon, place.longitude, place.location?.lng, place.location?.lon, place.location?.longitude, place.coordinates?.lng, place.coordinates?.lon, place.coordinates?.longitude);
  return {
    businessId: id,
    name,
    category: Array.isArray(place.categories) ? place.categories.join(', ') : (place.categoryName || place.category || ''),
    address: place.address || place.location?.address || '',
    district: place.city || place.neighborhood || '',
    phone: place.phone || place.phoneNumber || '',
    website: place.website || '',
    instagram: place.instagram || place.instagrams?.[0] || '',
    mapsLink,
    lat,
    lng,
    rating: place.totalScore ?? place.rating ?? '',
    reviewsCount: place.reviewsCount ?? place.reviewCount ?? '',
    priceRange: place.price || place.priceRange || '',
    openingHours: typeof place.openingHours === 'string' ? place.openingHours : JSON.stringify(place.openingHours || ''),
    sourceQuery,
    firstSeenAt: new Date().toISOString(),
    lastSeenAt: new Date().toISOString(),
    freshnessScore: freshnessScore(place),
    aiNote: '',
    platformPresence: '',
    menuSummary: '',
    leadQuality: '',
    leadStatus: 'new',
    contacted: false
  };
}
