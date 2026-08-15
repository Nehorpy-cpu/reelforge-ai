import type { Express } from 'express';
import { SUBSCRIPTION_PLANS } from '../saas.js';
import { AuthRequest, requireAuth, requireRole } from './auth.js';
import { db, id, json, now, parseJson, transaction } from './db.js';

const mapProduct = (row: any) => ({ ...row, active: Boolean(row.active), benefits: parseJson(row.benefits_json, []), benefits_json: undefined });
const mapCampaign = (row: any) => ({ ...row, strategy: parseJson(row.strategy_json, {}), creative: parseJson(row.creative_json, {}), visual: parseJson(row.visual_json, {}), copy: parseJson(row.copy_json, {}), audit: parseJson(row.audit_json, {}) });

export function registerWorkspaceRoutes(app: Express) {
  app.use('/api/workspace', requireAuth);

  app.get('/api/workspace/dashboard', (req: AuthRequest, res) => {
    const org = req.auth!.organizationId;
    const subscription = db.prepare('SELECT * FROM subscriptions WHERE organization_id=?').get(org) as any;
    const plan = SUBSCRIPTION_PLANS.find(item => item.id === subscription?.plan_id) || SUBSCRIPTION_PLANS[0];
    const periodKey = String(subscription?.period_start || now()).slice(0, 7);
    const usage = db.prepare(`SELECT COALESCE(SUM(CASE WHEN kind='consumption' THEN units WHEN kind='adjustment' THEN units ELSE 0 END),0) consumed, COALESCE(SUM(CASE WHEN kind='reservation' THEN units WHEN kind='release' THEN -units ELSE 0 END),0) reserved FROM usage_ledger WHERE organization_id=? AND period_key=?`).get(org, periodKey) as any;
    const counts = {
      products: (db.prepare('SELECT COUNT(*) n FROM products WHERE organization_id=? AND active=1').get(org) as any).n,
      campaigns: (db.prepare('SELECT COUNT(*) n FROM campaigns WHERE organization_id=?').get(org) as any).n,
      renders: (db.prepare("SELECT COUNT(*) n FROM render_jobs WHERE organization_id=? AND status='completed'").get(org) as any).n,
    };
    const costs = (db.prepare('SELECT COALESCE(SUM(cost_usd),0) total FROM provider_cost_events WHERE organization_id=?').get(org) as any).total;
    res.json({ plan, subscription, usage: { consumed: usage.consumed, reserved: usage.reserved, limit: plan.monthlyVideos }, counts, providerCostUsd: costs });
  });

  app.get('/api/workspace/brand-dna', (req: AuthRequest, res) => {
    const rows = db.prepare('SELECT * FROM brand_dna WHERE organization_id=? ORDER BY version DESC').all(req.auth!.organizationId) as any[];
    res.json(rows.map(row => ({ ...row, data: parseJson(row.data_json, {}), sources: parseJson(row.sources_json, []) })));
  });

  app.post('/api/workspace/brand-dna', requireRole('owner','admin','editor'), (req: AuthRequest, res) => {
    const { data, sources = [], status = 'draft' } = req.body;
    if (!data?.companyName) return res.status(400).json({ error: 'DNA inválido.' });
    const org = req.auth!.organizationId;
    const version = Number((db.prepare('SELECT MAX(version) version FROM brand_dna WHERE organization_id=?').get(org) as any)?.version || 0) + 1;
    const dnaId = id();
    transaction(() => {
      if (status === 'approved') db.prepare("UPDATE brand_dna SET status='archived' WHERE organization_id=? AND status='approved'").run(org);
      db.prepare('INSERT INTO brand_dna VALUES(?,?,?,?,?,?,?,?,?)').run(dnaId, org, version, status, json(data), json(sources), req.auth!.userId, now(), status === 'approved' ? now() : null);
    });
    res.status(201).json({ id: dnaId, version, status, data, sources });
  });

  app.post('/api/workspace/brand-dna/:id/approve', requireRole('owner','admin'), (req: AuthRequest, res) => {
    const org = req.auth!.organizationId;
    const found = db.prepare('SELECT id FROM brand_dna WHERE id=? AND organization_id=?').get(req.params.id, org);
    if (!found) return res.status(404).json({ error: 'DNA no encontrado.' });
    transaction(() => {
      db.prepare("UPDATE brand_dna SET status='archived' WHERE organization_id=? AND status='approved'").run(org);
      db.prepare("UPDATE brand_dna SET status='approved',approved_at=? WHERE id=? AND organization_id=?").run(now(), req.params.id, org);
    });
    res.json({ ok: true });
  });

  app.get('/api/workspace/products', (req: AuthRequest, res) => res.json((db.prepare('SELECT * FROM products WHERE organization_id=? ORDER BY created_at DESC').all(req.auth!.organizationId) as any[]).map(mapProduct)));

  app.get('/api/workspace/voices', (req: AuthRequest, res) => {
    const rows = db.prepare('SELECT * FROM voice_profiles WHERE organization_id=? OR system_voice=1 ORDER BY system_voice DESC,created_at DESC').all(req.auth!.organizationId) as any[];
    res.json(rows.map(row => ({ ...row, system_voice: Boolean(row.system_voice), active: Boolean(row.active), settings: parseJson(row.settings_json, {}), consent: parseJson(row.consent_json, {}) })));
  });
  app.post('/api/workspace/voices', requireRole('owner','admin','editor'), (req: AuthRequest, res) => {
    const { name, provider = 'reference', providerVoiceId = null, gender = null, style = '', audioUrl = null, settings = {}, consent = {} } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Nombre obligatorio.' });
    const voiceId = id();
    db.prepare('INSERT INTO voice_profiles VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').run(voiceId, req.auth!.organizationId, name.trim(), provider, providerVoiceId, gender, style, audioUrl, json(settings), json(consent), 0, 1, now());
    res.status(201).json({ id: voiceId, name, provider, audioUrl, settings, consent });
  });

  app.get('/api/workspace/connections', (req: AuthRequest, res) => {
    const rows = db.prepare('SELECT id,provider,account_name,status,scopes_json,metadata_json,last_sync_at,created_at,updated_at FROM source_connections WHERE organization_id=?').all(req.auth!.organizationId) as any[];
    res.json(rows.map(row => ({ ...row, scopes: parseJson(row.scopes_json, []), metadata: parseJson(row.metadata_json, {}) })));
  });
  app.post('/api/workspace/connections/import', requireRole('owner','admin'), (req: AuthRequest, res) => {
    const { provider = 'manual', accountName = 'Importación manual', content = '', metadata = {} } = req.body;
    if (String(content).trim().length < 10) return res.status(400).json({ error: 'La fuente está vacía.' });
    const connectionId = id(), timestamp = now();
    db.prepare('INSERT INTO source_connections VALUES(?,?,?,?,?,?,?,?,?,?)').run(connectionId, req.auth!.organizationId, provider, accountName, 'connected', null, json([]), json({ ...metadata, importedContent: String(content).slice(0, 100000) }), timestamp, timestamp, timestamp);
    res.status(201).json({ id: connectionId, provider, accountName, status: 'connected', lastSyncAt: timestamp });
  });
  app.post('/api/workspace/connections/:id/disconnect', requireRole('owner','admin'), (req: AuthRequest, res) => {
    const result = db.prepare("UPDATE source_connections SET status='disconnected',encrypted_token=NULL,updated_at=? WHERE id=? AND organization_id=?").run(now(), req.params.id, req.auth!.organizationId);
    if (!result.changes) return res.status(404).json({ error: 'Conexión no encontrada.' }); res.json({ ok: true });
  });
  app.post('/api/workspace/products', requireRole('owner','admin','editor'), (req: AuthRequest, res) => {
    const { name, category = '', description = '', benefits = [], price = null, url = null, imageUrl = null } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'El nombre es obligatorio.' });
    const productId = id(), timestamp = now();
    db.prepare('INSERT INTO products VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(productId, req.auth!.organizationId, name.trim(), category, description, json(benefits), price, url, imageUrl, 1, timestamp, timestamp);
    res.status(201).json(mapProduct(db.prepare('SELECT * FROM products WHERE id=?').get(productId)));
  });
  app.put('/api/workspace/products/:id', requireRole('owner','admin','editor'), (req: AuthRequest, res) => {
    const existing = db.prepare('SELECT * FROM products WHERE id=? AND organization_id=?').get(req.params.id, req.auth!.organizationId) as any;
    if (!existing) return res.status(404).json({ error: 'Producto no encontrado.' });
    const body = req.body;
    db.prepare('UPDATE products SET name=?,category=?,description=?,benefits_json=?,price=?,url=?,image_url=?,active=?,updated_at=? WHERE id=? AND organization_id=?').run(body.name ?? existing.name, body.category ?? existing.category, body.description ?? existing.description, json(body.benefits ?? parseJson(existing.benefits_json, [])), body.price ?? existing.price, body.url ?? existing.url, body.imageUrl ?? existing.image_url, body.active === undefined ? existing.active : Number(Boolean(body.active)), now(), req.params.id, req.auth!.organizationId);
    res.json(mapProduct(db.prepare('SELECT * FROM products WHERE id=?').get(req.params.id)));
  });
  app.delete('/api/workspace/products/:id', requireRole('owner','admin','editor'), (req: AuthRequest, res) => {
    const result = db.prepare('UPDATE products SET active=0,updated_at=? WHERE id=? AND organization_id=?').run(now(), req.params.id, req.auth!.organizationId);
    if (!result.changes) return res.status(404).json({ error: 'Producto no encontrado.' });
    res.status(204).end();
  });

  app.get('/api/workspace/campaigns', (req: AuthRequest, res) => res.json((db.prepare('SELECT * FROM campaigns WHERE organization_id=? ORDER BY created_at DESC LIMIT 100').all(req.auth!.organizationId) as any[]).map(mapCampaign)));
  app.get('/api/workspace/campaigns/:id', (req: AuthRequest, res) => {
    const row = db.prepare('SELECT * FROM campaigns WHERE id=? AND organization_id=?').get(req.params.id, req.auth!.organizationId);
    if (!row) return res.status(404).json({ error: 'Campaña no encontrada.' }); res.json(mapCampaign(row));
  });

  app.get('/api/workspace/renders', (req: AuthRequest, res) => {
    const rows = db.prepare('SELECT r.*,c.title campaign_title FROM render_jobs r JOIN campaigns c ON c.id=r.campaign_id WHERE r.organization_id=? ORDER BY r.created_at DESC LIMIT 100').all(req.auth!.organizationId);
    res.json(rows);
  });
  app.get('/api/workspace/artifacts', (req: AuthRequest, res) => {
    const rows = db.prepare('SELECT a.*,c.title campaign_title FROM artifacts a JOIN campaigns c ON c.id=a.campaign_id WHERE a.organization_id=? ORDER BY a.created_at DESC LIMIT 100').all(req.auth!.organizationId) as any[];
    res.json(rows.map(row => ({ ...row, metadata: parseJson(row.metadata_json, {}) })));
  });

}
