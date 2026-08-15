import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import dotenv from 'dotenv';

dotenv.config({ path: ['.env.local', '.env'] });

const dataDir = path.resolve(process.env.DATA_DIR || 'data');
fs.mkdirSync(dataDir, { recursive: true });

export const db = new DatabaseSync(path.join(dataDir, 'reel-studio.db'));
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');

export function migrate() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
      password_hash TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE, expires_at TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS organizations (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, slug TEXT NOT NULL UNIQUE,
      locale TEXT NOT NULL DEFAULT 'es-PY', created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS memberships (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK(role IN ('owner','admin','editor','viewer')),
      PRIMARY KEY(user_id, organization_id)
    );
    CREATE TABLE IF NOT EXISTS subscriptions (
      organization_id TEXT PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
      plan_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active',
      period_start TEXT NOT NULL, period_end TEXT NOT NULL,
      external_customer_id TEXT, external_subscription_id TEXT, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS billing_transactions (
      id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      plan_id TEXT NOT NULL, shop_process_id TEXT NOT NULL UNIQUE, process_id TEXT NOT NULL,
      amount TEXT NOT NULL, currency TEXT NOT NULL, status TEXT NOT NULL,
      payload_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL, updated_at TEXT NOT NULL, confirmed_at TEXT
    );
    CREATE TABLE IF NOT EXISTS brand_dna (
      id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      version INTEGER NOT NULL, status TEXT NOT NULL CHECK(status IN ('draft','approved','archived')),
      data_json TEXT NOT NULL, sources_json TEXT NOT NULL DEFAULT '[]', created_by TEXT NOT NULL,
      created_at TEXT NOT NULL, approved_at TEXT,
      UNIQUE(organization_id, version)
    );
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      name TEXT NOT NULL, category TEXT NOT NULL DEFAULT '', description TEXT NOT NULL DEFAULT '',
      benefits_json TEXT NOT NULL DEFAULT '[]', price TEXT, url TEXT, image_url TEXT,
      active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS voice_profiles (
      id TEXT PRIMARY KEY, organization_id TEXT REFERENCES organizations(id) ON DELETE CASCADE,
      name TEXT NOT NULL, provider TEXT NOT NULL DEFAULT 'reference', provider_voice_id TEXT,
      gender TEXT, style TEXT NOT NULL DEFAULT '', audio_url TEXT, settings_json TEXT NOT NULL DEFAULT '{}',
      consent_json TEXT NOT NULL DEFAULT '{}', system_voice INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS source_connections (
      id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      provider TEXT NOT NULL, account_name TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'pending',
      encrypted_token TEXT, scopes_json TEXT NOT NULL DEFAULT '[]', metadata_json TEXT NOT NULL DEFAULT '{}',
      last_sync_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      UNIQUE(organization_id, provider, account_name)
    );
    CREATE TABLE IF NOT EXISTS campaigns (
      id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      title TEXT NOT NULL, brief TEXT NOT NULL, platform TEXT NOT NULL, duration_seconds INTEGER NOT NULL,
      status TEXT NOT NULL, strategy_json TEXT NOT NULL DEFAULT '{}', creative_json TEXT NOT NULL DEFAULT '{}',
      visual_json TEXT NOT NULL DEFAULT '{}', copy_json TEXT NOT NULL DEFAULT '{}', audit_json TEXT NOT NULL DEFAULT '{}',
      voice_profile_id TEXT, created_by TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS render_jobs (
      id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
      idempotency_key TEXT NOT NULL, status TEXT NOT NULL, provider TEXT NOT NULL, model TEXT NOT NULL,
      progress INTEGER NOT NULL DEFAULT 0, error TEXT, provider_job_id TEXT, estimated_cost_usd REAL NOT NULL DEFAULT 0,
      actual_cost_usd REAL, created_at TEXT NOT NULL, started_at TEXT, completed_at TEXT,
      UNIQUE(organization_id, idempotency_key)
    );
    CREATE TABLE IF NOT EXISTS artifacts (
      id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
      render_job_id TEXT REFERENCES render_jobs(id) ON DELETE SET NULL,
      kind TEXT NOT NULL, url TEXT NOT NULL, mime_type TEXT NOT NULL, bytes INTEGER,
      metadata_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS usage_ledger (
      id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      render_job_id TEXT REFERENCES render_jobs(id) ON DELETE SET NULL,
      period_key TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('reservation','consumption','release','adjustment')),
      units INTEGER NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS provider_cost_events (
      id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      render_job_id TEXT REFERENCES render_jobs(id) ON DELETE SET NULL,
      provider TEXT NOT NULL, model TEXT NOT NULL, operation TEXT NOT NULL,
      quantity REAL NOT NULL, unit TEXT NOT NULL, cost_usd REAL NOT NULL,
      pricing_snapshot_json TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS provider_assets (
      id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      render_job_id TEXT REFERENCES render_jobs(id) ON DELETE SET NULL,
      provider TEXT NOT NULL, provider_file_id TEXT, provider_interaction_id TEXT,
      kind TEXT NOT NULL, created_at TEXT NOT NULL,
      UNIQUE(provider, provider_file_id), UNIQUE(provider, provider_interaction_id)
    );
    CREATE TABLE IF NOT EXISTS ai_operation_ledger (
      id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      period_key TEXT NOT NULL, operation TEXT NOT NULL, request_key TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('reserved','completed','failed')), created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      UNIQUE(organization_id, request_key)
    );
    CREATE INDEX IF NOT EXISTS idx_products_org ON products(organization_id);
    CREATE INDEX IF NOT EXISTS idx_campaigns_org ON campaigns(organization_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_jobs_status ON render_jobs(status, created_at);
    CREATE INDEX IF NOT EXISTS idx_usage_period ON usage_ledger(organization_id, period_key);
    CREATE INDEX IF NOT EXISTS idx_provider_assets_org_file ON provider_assets(organization_id, provider_file_id);
    CREATE INDEX IF NOT EXISTS idx_provider_assets_org_interaction ON provider_assets(organization_id, provider_interaction_id);
    CREATE INDEX IF NOT EXISTS idx_ai_operations_period ON ai_operation_ledger(organization_id, period_key, operation, status);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_usage_job_kind ON usage_ledger(render_job_id, kind)
      WHERE render_job_id IS NOT NULL AND kind IN ('reservation','consumption','release');
  `);
}

export const id = () => crypto.randomUUID();
export const now = () => new Date().toISOString();
export const json = (value: unknown) => JSON.stringify(value ?? null);
export function parseJson<T>(value: unknown, fallback: T): T {
  try { return typeof value === 'string' ? JSON.parse(value) : fallback; } catch { return fallback; }
}

export function transaction<T>(fn: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try { const result = fn(); db.exec('COMMIT'); return result; }
  catch (error) { db.exec('ROLLBACK'); throw error; }
}
