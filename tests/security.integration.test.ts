import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { once } from 'node:events';

const port = 3217;
const dataDir = mkdtempSync(path.join(tmpdir(), 'reelforge-security-'));
let server: ChildProcess;

async function waitForServer() {
  for (let attempt = 0; attempt < 60; attempt++) {
    try { if ((await fetch(`http://127.0.0.1:${port}/api/health`)).ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('Test server did not start');
}

test.before(async () => {
  server = spawn(process.execPath, ['--import', 'tsx', 'server.ts'], {
    cwd: process.cwd(), stdio: 'ignore',
    env: { ...process.env, PORT: String(port), DATA_DIR: dataDir, NODE_ENV: 'production', COOKIE_SECURE: 'false' }
  });
  await waitForServer();
});

test.after(async () => {
  if (server && server.exitCode === null) {
    server.kill('SIGTERM');
    await Promise.race([once(server, 'exit'), new Promise(resolve => setTimeout(resolve, 3_000))]);
  }
  for (let attempt = 0; attempt < 5; attempt++) {
    try { rmSync(dataDir, { recursive: true, force: true }); break; }
    catch { await new Promise(resolve => setTimeout(resolve, 100)); }
  }
});

test('anonymous AI calls are rejected before provider access', async () => {
  const response = await fetch(`http://127.0.0.1:${port}/api/generate-tts`, { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({ text:'prueba' }) });
  assert.equal(response.status, 401);
});

test('tenant owner keeps valid access while plan duration is enforced', async () => {
  const email = `owner-${crypto.randomUUID()}@example.test`;
  const register = await fetch(`http://127.0.0.1:${port}/api/auth/register`, { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({ email, password:'A-long-test-password-42!', name:'Owner Test', companyName:'Tenant Test' }) });
  assert.equal(register.status, 201);
  const cookie = register.headers.get('set-cookie')!.split(';')[0];
  const tooLong = await fetch(`http://127.0.0.1:${port}/api/campaign/prepare`, { method:'POST', headers:{'content-type':'application/json',cookie}, body:JSON.stringify({ brief:'Campaña verificable de seguridad', durationSeconds:16 }) });
  assert.equal(tooLong.status, 400);
  const valid = await fetch(`http://127.0.0.1:${port}/api/campaign/prepare`, { method:'POST', headers:{'content-type':'application/json',cookie}, body:JSON.stringify({ brief:'Campaña verificable de seguridad', durationSeconds:15 }) });
  assert.equal(valid.status, 201);
  const unknownVideo = await fetch(`http://127.0.0.1:${port}/api/video/not-owned`, { headers:{cookie} });
  assert.equal(unknownVideo.status, 404);

  const db = new DatabaseSync(path.join(dataDir, 'reel-studio.db'));
  const owner = db.prepare('SELECT u.id user_id,m.organization_id FROM users u JOIN memberships m ON m.user_id=u.id WHERE u.email=?').get(email) as any;
  const viewerId = crypto.randomUUID(), token = crypto.randomBytes(32).toString('base64url');
  db.prepare('INSERT INTO users VALUES(?,?,?,?,?)').run(viewerId, `viewer-${crypto.randomUUID()}@example.test`, 'Viewer', 'unused', new Date().toISOString());
  db.prepare('INSERT INTO memberships VALUES(?,?,?)').run(viewerId, owner.organization_id, 'viewer');
  db.prepare('INSERT INTO sessions VALUES(?,?,?,?,?)').run(crypto.randomUUID(), viewerId, crypto.createHash('sha256').update(token).digest('hex'), new Date(Date.now()+60_000).toISOString(), new Date().toISOString());
  db.close();
  const viewerWrite = await fetch(`http://127.0.0.1:${port}/api/workspace/products`, { method:'POST', headers:{'content-type':'application/json',cookie:`reel_session=${token}`}, body:JSON.stringify({ name:'No permitido' }) });
  assert.equal(viewerWrite.status, 403);
});

test('oversized requests are rejected before JSON parsing', async () => {
  const body = JSON.stringify({ prompt:'x', imageBase64:'A'.repeat(13 * 1024 * 1024) });
  const response = await fetch(`http://127.0.0.1:${port}/api/generate-image`, { method:'POST', headers:{'content-type':'application/json'}, body });
  assert.equal(response.status, 413);
});

test('approved DNA is automatically injected and agent decisions are traceable', async () => {
  const email = `dna-${crypto.randomUUID()}@example.test`;
  const register = await fetch(`http://127.0.0.1:${port}/api/auth/register`, { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({ email, password:'A-long-test-password-42!', name:'DNA Owner', companyName:'DNA Tenant' }) });
  const cookie = register.headers.get('set-cookie')!.split(';')[0];
  const dna = await fetch(`http://127.0.0.1:${port}/api/workspace/brand-dna`, { method:'POST', headers:{'content-type':'application/json',cookie}, body:JSON.stringify({ status:'approved', data:{ companyName:'Marca DNA', audience:['coleccionistas'], tone:['cálido'] }, sources:['manual'] }) });
  assert.equal(dna.status, 201);
  const campaign = await fetch(`http://127.0.0.1:${port}/api/campaign/prepare`, { method:'POST', headers:{'content-type':'application/json',cookie}, body:JSON.stringify({ brief:'Presentar el producto sin ofertas inventadas',durationSeconds:15 }) });
  assert.equal(campaign.status, 201);
  const prepared = await campaign.json() as any;
  assert.equal(prepared.dnaVersion, 1);
  assert.equal(prepared.mode, 'local-simulation');
  const trace = await fetch(`http://127.0.0.1:${port}/api/workspace/campaigns/${prepared.id}/agent-run`, { headers:{cookie} });
  assert.equal(trace.status, 200);
  const run = await trace.json() as any;
  assert.equal(run.status, 'completed');
  assert.ok(run.events.some((event: any) => event.agent_id === 'ceo' && event.input?.brandDna?.companyName === 'Marca DNA'));
  assert.ok(run.events.some((event: any) => event.agent_id === 'guard' && event.phase === 'completed'));
});

test('failed AI requests are released from quota accounting', async () => {
  const email = `quota-${crypto.randomUUID()}@example.test`;
  const register = await fetch(`http://127.0.0.1:${port}/api/auth/register`, { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({ email, password:'A-long-test-password-42!', name:'Quota Owner', companyName:'Quota Tenant' }) });
  const cookie = register.headers.get('set-cookie')!.split(';')[0];
  const response = await fetch(`http://127.0.0.1:${port}/api/campaign/prepare`, { method:'POST', headers:{'content-type':'application/json',cookie,'x-idempotency-key':`failed-${crypto.randomUUID()}`}, body:JSON.stringify({ brief:'corto' }) });
  assert.equal(response.status, 400);
  await new Promise(resolve => setTimeout(resolve, 20));
  const db = new DatabaseSync(path.join(dataDir, 'reel-studio.db'));
  const row = db.prepare("SELECT l.status FROM ai_operation_ledger l JOIN memberships m ON m.organization_id=l.organization_id JOIN users u ON u.id=m.user_id WHERE u.email=? ORDER BY l.created_at DESC LIMIT 1").get(email) as any;
  db.close();
  assert.equal(row.status, 'failed');
});
