import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const monorepoRoot = path.resolve(projectRoot, '..');

function readEnvFile(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const [k, ...rest] = line.split('=');
    out[k.trim()] = rest.join('=').trim().replace(/^['"]|['"]$/g, '');
  }
  return out;
}

const hermesEnv = path.join(os.homedir(), 'AppData', 'Local', 'hermes', '.env');
const localEnv = path.join(projectRoot, '.env');
const merged = { ...readEnvFile(hermesEnv), ...readEnvFile(localEnv), ...process.env };

export const config = {
  port: Number(merged.PORT || 3030),
  baseUrl: merged.OPENAI_COMPAT_BASE_URL || 'https://openrouter.ai/api/v1',
  apiKey: merged.OPENAI_COMPAT_API_KEY || '',
  dataDir: path.join(projectRoot, 'data'),
  monorepoRoot,
  scraperExe: path.join(monorepoRoot, 'tools', process.platform === 'win32' ? 'google-maps-scraper.exe' : 'google-maps-scraper')
};

export const models = {
  classifier: merged.MODEL_CLASSIFIER || 'google/gemini-2.5-flash:free',
  enricher: merged.MODEL_ENRICHER || 'google/gemini-2.5-flash:free'
};
