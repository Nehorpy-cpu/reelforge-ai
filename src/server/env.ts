import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

const envPaths = ['.env.local', '.env', 'APIGemini.env'];
dotenv.config({ path: envPaths });

// Backward compatibility for the existing local secret file, whose label
// contains a space and therefore cannot be parsed as a standard dotenv key.
// Explicit GEMINI_API_KEY always wins, including values injected by hosting.
if (!process.env.GEMINI_API_KEY && process.env.DISABLE_LOCAL_GEMINI_ENV !== 'true') {
  const legacyPath = path.resolve('APIGemini.env');
  if (fs.existsSync(legacyPath)) {
    const raw = fs.readFileSync(legacyPath, 'utf8').trim();
    const separator = raw.indexOf('=');
    if (separator > 0) {
      const label = raw.slice(0, separator).replace(/[^a-z]/gi, '').toLowerCase();
      const value = raw.slice(separator + 1).trim().replace(/^(['"])(.*)\1$/, '$2');
      if (label === 'geminiapikey' && value) process.env.GEMINI_API_KEY = value;
    }
  }
}

export const envStatus = () => ({ geminiConfigured: Boolean(process.env.GEMINI_API_KEY) });
