import fs from 'node:fs';
import { config } from './config.mjs';

console.log(JSON.stringify({
  node: process.version,
  localGoogleMapsScraper: fs.existsSync(config.scraperExe),
  scraperPath: config.scraperExe,
  modelApi: config.baseUrl,
  dashboardPort: config.port
}, null, 2));
