import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { db, id, now, transaction } from './db.js';

const SESSION_DAYS = 30;

export type AuthRequest = Request & { auth?: { userId: string; organizationId: string; role: string } };

function hashPassword(password: string, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, encoded: string) {
  const [salt, expected] = encoded.split(':');
  if (!salt || !expected) return false;
  const actual = crypto.scryptSync(password, salt, 64);
  return crypto.timingSafeEqual(actual, Buffer.from(expected, 'hex'));
}

const tokenHash = (token: string) => crypto.createHash('sha256').update(token).digest('hex');

function slugify(value: string) {
  const base = value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'empresa';
  return `${base}-${crypto.randomBytes(3).toString('hex')}`;
}

function setSession(res: Response, userId: string) {
  const token = crypto.randomBytes(32).toString('base64url');
  const expires = new Date(Date.now() + SESSION_DAYS * 86400000);
  db.prepare('INSERT INTO sessions(id,user_id,token_hash,expires_at,created_at) VALUES(?,?,?,?,?)').run(id(), userId, tokenHash(token), expires.toISOString(), now());
  const secureCookie = process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === 'true' : process.env.NODE_ENV === 'production';
  res.cookie('reel_session', token, { httpOnly: true, sameSite: 'lax', secure: secureCookie, maxAge: SESSION_DAYS * 86400000, path: '/' });
}

function cookie(req: Request, name: string) {
  const item = (req.headers.cookie || '').split(';').map(part => part.trim()).find(part => part.startsWith(`${name}=`));
  return item ? decodeURIComponent(item.slice(name.length + 1)) : '';
}

export function registerAuthRoutes(app: import('express').Express) {
  app.post('/api/auth/register', (req, res) => {
    const { email = '', password = '', name = '', companyName = '' } = req.body;
    if (!/^\S+@\S+\.\S+$/.test(email) || password.length < 8 || name.trim().length < 2 || companyName.trim().length < 2) return res.status(400).json({ error: 'Datos inválidos. La contraseña debe tener al menos 8 caracteres.' });
    try {
      const result = transaction(() => {
        const userId = id(), organizationId = id(), timestamp = now();
        db.prepare('INSERT INTO users VALUES(?,?,?,?,?)').run(userId, email.trim().toLowerCase(), name.trim(), hashPassword(password), timestamp);
        db.prepare('INSERT INTO organizations VALUES(?,?,?,?,?)').run(organizationId, companyName.trim(), slugify(companyName), 'es-PY', timestamp);
        db.prepare('INSERT INTO memberships VALUES(?,?,?)').run(userId, organizationId, 'owner');
        const start = new Date(); const end = new Date(start); end.setMonth(end.getMonth() + 1);
        db.prepare('INSERT INTO subscriptions VALUES(?,?,?,?,?,?,?,?)').run(organizationId, 'starter', 'trialing', start.toISOString(), end.toISOString(), null, null, timestamp);
        return { userId, organizationId };
      });
      setSession(res, result.userId); res.status(201).json({ ok: true, organizationId: result.organizationId });
    } catch (error: any) { res.status(error.code?.includes('UNIQUE') ? 409 : 500).json({ error: error.code?.includes('UNIQUE') ? 'El email ya está registrado.' : 'No se pudo crear la cuenta.' }); }
  });

  app.post('/api/auth/login', (req, res) => {
    const user = db.prepare('SELECT * FROM users WHERE email=?').get(String(req.body.email || '').trim().toLowerCase()) as any;
    if (!user || !verifyPassword(String(req.body.password || ''), user.password_hash)) return res.status(401).json({ error: 'Credenciales incorrectas.' });
    setSession(res, user.id); res.json({ ok: true });
  });

  app.post('/api/auth/logout', (req, res) => {
    const token = cookie(req, 'reel_session');
    if (token) db.prepare('DELETE FROM sessions WHERE token_hash=?').run(tokenHash(token));
    res.clearCookie('reel_session', { path: '/' }); res.json({ ok: true });
  });
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const token = cookie(req, 'reel_session') || String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Autenticación requerida.' });
  const requestedOrg = String(req.headers['x-organization-id'] || '');
  const row = db.prepare(`SELECT s.user_id, m.organization_id, m.role FROM sessions s JOIN memberships m ON m.user_id=s.user_id WHERE s.token_hash=? AND s.expires_at>? ${requestedOrg ? 'AND m.organization_id=?' : ''} ORDER BY CASE m.role WHEN 'owner' THEN 1 ELSE 2 END LIMIT 1`).get(...(requestedOrg ? [tokenHash(token), now(), requestedOrg] : [tokenHash(token), now()])) as any;
  if (!row) return res.status(401).json({ error: 'Sesión inválida o vencida.' });
  req.auth = { userId: row.user_id, organizationId: row.organization_id, role: row.role }; next();
}

export function requireRole(...allowedRoles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.auth) return res.status(401).json({ error: 'Autenticación requerida.' });
    if (!allowedRoles.includes(req.auth.role)) return res.status(403).json({ error: 'Permisos insuficientes.' });
    next();
  };
}

export function registerMeRoute(app: import('express').Express) {
  app.get('/api/me', requireAuth, (req: AuthRequest, res) => {
    const user = db.prepare('SELECT id,email,name,created_at FROM users WHERE id=?').get(req.auth!.userId);
    const organizations = db.prepare('SELECT o.*,m.role FROM organizations o JOIN memberships m ON m.organization_id=o.id WHERE m.user_id=?').all(req.auth!.userId);
    const subscription = db.prepare('SELECT * FROM subscriptions WHERE organization_id=?').get(req.auth!.organizationId);
    res.json({ user, organizations, activeOrganizationId: req.auth!.organizationId, subscription });
  });
}
