import crypto from 'node:crypto';
import type { Express, Request } from 'express';
import { SUBSCRIPTION_PLANS, type PlanId } from '../saas.js';
import { AuthRequest, requireAuth, requireRole } from './auth.js';
import { db, id, json, now, transaction } from './db.js';

const amountEnv: Record<PlanId, string> = {
  starter: 'BANCARD_AMOUNT_STARTER', growth: 'BANCARD_AMOUNT_GROWTH', agency: 'BANCARD_AMOUNT_AGENCY'
};
const defaultAmounts: Record<PlanId, number> = { starter: 299000, growth: 749000, agency: 1890000 };
const md5 = (value: string) => crypto.createHash('md5').update(value).digest('hex');
const secureEqual = (left: string, right: string) => {
  const a = Buffer.from(left), b = Buffer.from(right);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};
const baseUrl = () => (process.env.BANCARD_BASE_URL || 'https://vpos.infonet.com.py:8888').replace(/\/$/, '');

function credentials() {
  const publicKey = process.env.BANCARD_PUBLIC_KEY, privateKey = process.env.BANCARD_PRIVATE_KEY;
  if (!publicKey || !privateKey) throw new Error('BANCARD_NOT_CONFIGURED');
  return { publicKey, privateKey };
}

export function registerBillingRoutes(app: Express) {
  app.post('/api/billing/checkout', requireAuth, requireRole('owner'), async (req: AuthRequest, res) => {
    try {
    const plan = SUBSCRIPTION_PLANS.find(item => item.id === req.body.planId);
    if (!plan) return res.status(400).json({ error: 'Plan inválido.' });
    let keys; try { keys = credentials(); } catch { return res.status(503).json({ error:'Bancard todavía no está configurado.', setupRequired:['BANCARD_PUBLIC_KEY','BANCARD_PRIVATE_KEY','BANCARD_BASE_URL'] }); }
    const amountNumber = Number(process.env[amountEnv[plan.id]] || defaultAmounts[plan.id]);
    if (!Number.isFinite(amountNumber) || amountNumber <= 0) return res.status(500).json({ error:'Importe Bancard inválido.' });
    const amount = amountNumber.toFixed(2), currency = 'PYG';
    const shopProcessId = String(Date.now()) + String(Math.floor(Math.random() * 1000)).padStart(3, '0');
    const origin = String(process.env.APP_URL || req.headers.origin || 'http://localhost:3000').replace(/\/$/, '');
    const operation = {
      token: md5(keys.privateKey + shopProcessId + amount + currency), shop_process_id: Number(shopProcessId),
      amount, currency, additional_data: `${req.auth!.organizationId}|${plan.id}`.slice(0,100),
      description: `Plan ${plan.name} - ReelForge AI`.slice(0,100), return_url: `${origin}/?billing=return`, cancel_url: `${origin}/?billing=cancel`
    };
    const response = await fetch(`${baseUrl()}/vpos/api/0.3/single_buy`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ public_key:keys.publicKey, operation }) });
    const data = await response.json() as any;
    if (!response.ok || data.status !== 'success' || !data.process_id) return res.status(502).json({ error:'Bancard no pudo iniciar el pago.' });
    db.prepare('INSERT INTO billing_transactions VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(id(), req.auth!.organizationId, plan.id, shopProcessId, String(data.process_id), amount, currency, 'pending', json(data), now(), now(), null);
    res.json({ provider:'bancard', processId:data.process_id, shopProcessId, amount, currency, status:'pending', checkoutScript:process.env.BANCARD_CHECKOUT_SCRIPT || `${baseUrl()}/checkout/javascript/dist/bancard-checkout-2.0.0.js` });
    } catch (error) {
      console.error('Bancard checkout error:', error);
      res.status(502).json({ error:'No se pudo conectar con Bancard.' });
    }
  });

  app.post('/api/billing/bancard/confirm', (req: Request, res) => {
    let keys; try { keys = credentials(); } catch { return res.status(503).json({ status:'error', messages:[{key:'configuration',dsc:'Bancard no configurado'}] }); }
    const operation = req.body?.operation || {}, shop = String(operation.shop_process_id || ''), amount = String(operation.amount || ''), currency = String(operation.currency || '');
    const row = db.prepare('SELECT * FROM billing_transactions WHERE shop_process_id=?').get(shop) as any;
    const expected = md5(keys.privateKey + shop + 'confirm' + amount + currency);
    if (!row || !operation.token || !secureEqual(String(operation.token), expected) || row.amount !== amount || row.currency !== currency) return res.status(400).json({ status:'error', messages:[{key:'invalid_token',dsc:'Confirmación inválida'}] });
    const approved = operation.response === 'S' || operation.response_code === '00' || operation.status === 'approved';
    transaction(() => {
      const current = db.prepare('SELECT * FROM billing_transactions WHERE shop_process_id=?').get(shop) as any;
      if (!current || current.status !== 'pending') return;
      const timestamp = now();
      const changed = db.prepare("UPDATE billing_transactions SET status=?,payload_json=?,updated_at=?,confirmed_at=? WHERE shop_process_id=? AND status='pending'").run(approved?'approved':'rejected', json(req.body), timestamp, timestamp, shop);
      if (approved && Number(changed.changes) === 1) db.prepare("UPDATE subscriptions SET plan_id=?,status='active',updated_at=? WHERE organization_id=?").run(current.plan_id, timestamp, current.organization_id);
    });
    res.json({ status:'success' });
  });

  app.get('/api/billing/transactions/:shopProcessId', requireAuth, requireRole('owner'), async (req: AuthRequest, res) => {
    try {
    const row = db.prepare('SELECT * FROM billing_transactions WHERE shop_process_id=? AND organization_id=?').get(req.params.shopProcessId, req.auth!.organizationId) as any;
    if (!row) return res.status(404).json({ error:'Pago no encontrado.' });
    if (row.status === 'pending') {
      let keys; try { keys = credentials(); } catch { return res.json(row); }
      const operation = { token:md5(keys.privateKey + row.shop_process_id + 'get_confirmation'), shop_process_id:Number(row.shop_process_id) };
      const response = await fetch(`${baseUrl()}/vpos/api/0.3/single_buy/confirmations`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ public_key:keys.publicKey, operation }) });
      const data = await response.json() as any;
      const approved = data.status === 'success' && (data.confirmation?.response === 'S' || data.confirmation?.response_code === '00');
      if (approved) transaction(() => {
        const timestamp = now();
        const changed = db.prepare("UPDATE billing_transactions SET status='approved',payload_json=?,updated_at=?,confirmed_at=? WHERE id=? AND status='pending'").run(json(data), timestamp, timestamp, row.id);
        if (Number(changed.changes) === 1) db.prepare("UPDATE subscriptions SET plan_id=?,status='active',updated_at=? WHERE organization_id=?").run(row.plan_id, timestamp, row.organization_id);
        row.status = 'approved';
      });
    }
    res.json({ id:row.id, planId:row.plan_id, shopProcessId:row.shop_process_id, processId:row.process_id, amount:row.amount, currency:row.currency, status:row.status, createdAt:row.created_at });
    } catch (error) {
      console.error('Bancard confirmation query error:', error);
      res.status(502).json({ error:'No se pudo consultar Bancard.' });
    }
  });
}
