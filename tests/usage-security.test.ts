import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

const dataDir = mkdtempSync(path.join(tmpdir(), 'reelforge-ledger-'));
process.env.DATA_DIR = dataDir;
const { db, migrate, now } = await import('../src/server/db.js');
const { consumeReservation, releaseReservation } = await import('../src/server/usage.js');
migrate();

test.after(() => { db.close(); rmSync(dataDir, { recursive:true, force:true }); });

test('reservation settlement is period-stable and idempotent', () => {
  const org = crypto.randomUUID(), user = crypto.randomUUID(), campaign = crypto.randomUUID(), job = crypto.randomUUID();
  db.prepare('INSERT INTO users VALUES(?,?,?,?,?)').run(user,'ledger@example.test','Ledger','unused',now());
  db.prepare('INSERT INTO organizations VALUES(?,?,?,?,?)').run(org,'Ledger Org',`ledger-${org}`,'es-PY',now());
  db.prepare('INSERT INTO memberships VALUES(?,?,?)').run(user,org,'owner');
  db.prepare('INSERT INTO campaigns VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(campaign,org,'Test','Brief','instagram',15,'approved','{}','{}','{}','{}','{}',null,user,now(),now());
  db.prepare('INSERT INTO render_jobs VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(job,org,campaign,'ledger-test','processing','mock','local',10,null,null,0,null,now(),now(),null);
  db.prepare('INSERT INTO usage_ledger VALUES(?,?,?,?,?,?,?)').run(crypto.randomUUID(),org,job,'2026-07','reservation',1,now());
  consumeReservation(org,job);
  consumeReservation(org,job);
  const rows = db.prepare('SELECT kind,period_key FROM usage_ledger WHERE render_job_id=? ORDER BY kind').all(job) as any[];
  assert.equal(rows.filter(row => row.kind === 'consumption').length, 1);
  assert.equal(rows.filter(row => row.kind === 'release').length, 1);
  assert.ok(rows.every(row => row.period_key === '2026-07'));
  releaseReservation(org,job);
  assert.equal((db.prepare("SELECT COUNT(*) n FROM usage_ledger WHERE render_job_id=? AND kind='release'").get(job) as any).n, 1);
});
