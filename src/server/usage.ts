import { SUBSCRIPTION_PLANS } from '../saas.js';
import { db, id, now, transaction } from './db.js';

export function currentEntitlement(organizationId: string) {
  const subscription = db.prepare('SELECT * FROM subscriptions WHERE organization_id=?').get(organizationId) as any;
  const plan = SUBSCRIPTION_PLANS.find(item => item.id === subscription?.plan_id) || SUBSCRIPTION_PLANS[0];
  const periodKey = String(subscription?.period_start || now()).slice(0, 7);
  const totals = db.prepare(`SELECT
    COALESCE(SUM(CASE WHEN kind='consumption' THEN units WHEN kind='adjustment' THEN units ELSE 0 END),0) consumed,
    COALESCE(SUM(CASE WHEN kind='reservation' THEN units WHEN kind='release' THEN -units ELSE 0 END),0) reserved
    FROM usage_ledger WHERE organization_id=? AND period_key=?`).get(organizationId, periodKey) as any;
  return { subscription, plan, periodKey, consumed: Number(totals.consumed), reserved: Number(totals.reserved) };
}

export function reserveVideo(organizationId: string, renderJobId: string) {
  return transaction(() => {
    const entitlement = currentEntitlement(organizationId);
    if (!['active', 'trialing'].includes(entitlement.subscription?.status)) throw new Error('SUBSCRIPTION_INACTIVE');
    if (entitlement.consumed + entitlement.reserved >= entitlement.plan.monthlyVideos) throw new Error('QUOTA_EXCEEDED');
    db.prepare('INSERT INTO usage_ledger VALUES(?,?,?,?,?,?,?)').run(id(), organizationId, renderJobId, entitlement.periodKey, 'reservation', 1, now());
    return entitlement;
  });
}

export function consumeReservation(organizationId: string, renderJobId: string) {
  transaction(() => {
    const reservation = db.prepare("SELECT period_key FROM usage_ledger WHERE organization_id=? AND render_job_id=? AND kind='reservation'").get(organizationId, renderJobId) as any;
    if (!reservation) throw new Error('RESERVATION_NOT_FOUND');
    const settled = db.prepare("SELECT 1 FROM usage_ledger WHERE organization_id=? AND render_job_id=? AND kind IN ('consumption','release') LIMIT 1").get(organizationId, renderJobId);
    if (settled) return;
    const periodKey = reservation.period_key;
    db.prepare('INSERT INTO usage_ledger VALUES(?,?,?,?,?,?,?)').run(id(), organizationId, renderJobId, periodKey, 'release', 1, now());
    db.prepare('INSERT INTO usage_ledger VALUES(?,?,?,?,?,?,?)').run(id(), organizationId, renderJobId, periodKey, 'consumption', 1, now());
  });
}

export function releaseReservation(organizationId: string, renderJobId: string) {
  transaction(() => {
    const reservation = db.prepare("SELECT period_key FROM usage_ledger WHERE organization_id=? AND render_job_id=? AND kind='reservation'").get(organizationId, renderJobId) as any;
    if (!reservation) return;
    const settled = db.prepare("SELECT 1 FROM usage_ledger WHERE organization_id=? AND render_job_id=? AND kind IN ('consumption','release') LIMIT 1").get(organizationId, renderJobId);
    if (settled) return;
    db.prepare('INSERT INTO usage_ledger VALUES(?,?,?,?,?,?,?)').run(id(), organizationId, renderJobId, reservation.period_key, 'release', 1, now());
  });
}
