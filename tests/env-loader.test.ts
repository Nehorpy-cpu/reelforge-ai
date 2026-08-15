import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

test('legacy Gemini APIKEY label is loaded without exposing its value', () => {
  const folder = mkdtempSync(path.join(tmpdir(), 'reelforge-env-'));
  writeFileSync(path.join(folder, 'APIGemini.env'), 'Gemini APIKEY=test-secret-value');
  const modulePath = path.resolve('src/server/env.ts').replace(/\\/g, '/');
  const tsxLoader = pathToFileURL(path.resolve('node_modules/tsx/dist/loader.mjs')).href;
  const script = `delete process.env.GEMINI_API_KEY; await import('file:///${modulePath}'); process.stdout.write(process.env.GEMINI_API_KEY === 'test-secret-value' ? 'ok' : 'missing')`;
  const result = spawnSync(process.execPath, ['--import',tsxLoader,'--input-type=module','--eval',script], { cwd:folder, encoding:'utf8', env:{...process.env,GEMINI_API_KEY:'',DISABLE_LOCAL_GEMINI_ENV:''} });
  rmSync(folder, { recursive:true, force:true });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim().slice(-2), 'ok');
});
