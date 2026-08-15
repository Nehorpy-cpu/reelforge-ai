import type { NextFunction, Response } from 'express';
import { SUBSCRIPTION_PLANS } from '../saas.js';
import type { AuthRequest } from './auth.js';
import { db, id, now, transaction } from './db.js';

export type AiOperation = 'analysis' | 'image' | 'audio' | 'video';

const multipliers: Record<AiOperation, number> = { analysis: 20, image: 12, audio: 12, video: 1 };

export function requireAiQuota(operation: AiOperation) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      transaction(() => {
        const subscription = db.prepare('SELECT * FROM subscriptions WHERE organization_id=?').get(req.auth!.organizationId) as any;
        if (!subscription || !['active', 'trialing'].includes(subscription.status)) throw new Error('SUBSCRIPTION_INACTIVE');
        const plan = SUBSCRIPTION_PLANS.find(item => item.id === subscription.plan_id) || SUBSCRIPTION_PLANS[0];
        const periodKey = String(subscription.period_start || now()).slice(0, 7);
        const limit = plan.monthlyVideos * multipliers[operation];
        const usage = db.prepare("SELECT COUNT(*) n FROM ai_operation_ledger WHERE organization_id=? AND period_key=? AND operation=? AND status IN ('reserved','completed')").get(req.auth!.organizationId, periodKey, operation) as any;
        if (Number(usage.n) >= limit) throw new Error('AI_OPERATION_QUOTA_EXCEEDED');
        const requestKey = String(req.headers['x-idempotency-key'] || id()).slice(0, 200);
        const existing = db.prepare('SELECT status FROM ai_operation_ledger WHERE organization_id=? AND request_key=?').get(req.auth!.organizationId, requestKey) as any;
        if (existing) throw new Error('DUPLICATE_AI_REQUEST');
        const timestamp = now();
        db.prepare('INSERT INTO ai_operation_ledger VALUES(?,?,?,?,?,?,?,?)').run(id(), req.auth!.organizationId, periodKey, operation, requestKey, 'completed', timestamp, timestamp);
      });
      next();
    } catch (error: any) {
      if (error.message === 'SUBSCRIPTION_INACTIVE') return res.status(402).json({ error: 'Suscripción inactiva.' });
      if (error.message === 'AI_OPERATION_QUOTA_EXCEEDED') return res.status(402).json({ error: `Límite mensual de operaciones ${operation} alcanzado.` });
      if (error.message === 'DUPLICATE_AI_REQUEST') return res.status(409).json({ error: 'Esta operación ya fue procesada.' });
      return res.status(500).json({ error: 'No se pudo reservar capacidad de IA.' });
    }
  };
}
