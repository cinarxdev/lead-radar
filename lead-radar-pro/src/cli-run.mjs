import { runDiscovery } from './orchestrator.mjs';

const args = Object.fromEntries(
  process.argv.slice(2).map((v, i, a) => v.startsWith('--') ? [v.slice(2), a[i + 1]] : []).filter(Boolean)
);

const params = {
  district: args.district || 'Kadıköy',
  neighborhoods: args.neighborhood ? String(args.neighborhood).split(',') : ['Moda'],
  limit: Number(args.limit || 5),
  searchTerms: args.terms ? String(args.terms).split(',') : ['cafe', 'restaurant'],
  fields: { name: true, phone: true, address: true, category: true, freshnessScore: true, mapsLink: true }
};

console.log(JSON.stringify(await runDiscovery(params), null, 2));
