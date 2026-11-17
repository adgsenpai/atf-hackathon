import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { one } from './db.js';

const SECRET = process.env.JWT_SECRET || 'dev-only-change-me';

export function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(pw, salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(pw, stored) {
  const [, salt, hash] = String(stored).split('$');
  if (!salt || !hash) return false;
  const test = crypto.scryptSync(pw, salt, 64);
  return crypto.timingSafeEqual(test, Buffer.from(hash, 'hex'));
}

export const signToken = (user) => jwt.sign({ sub: user.id, role: user.role }, SECRET, { expiresIn: '7d' });

export function publicUser(u) {
  if (!u) return null;
  return {
    id: u.id, email: u.email, pseudonym: u.pseudonym, role: u.role,
    verified: u.verified, municipality_id: u.municipality_id, created_at: u.created_at,
  };
}

/** Attaches req.user if a valid bearer token is present. Never rejects. */
export async function loadUser(req, _res, next) {
  const h = req.headers.authorization || '';
  if (h.startsWith('Bearer ')) {
    try {
      const { sub } = jwt.verify(h.slice(7), SECRET);
      req.user = await one('SELECT * FROM users WHERE id=$1', [sub]);
    } catch { /* invalid token -> anonymous */ }
  }
  next();
}

export const requireUser = (req, res, next) =>
  req.user ? next() : res.status(401).json({ error: 'Sign in required' });

export const requireRole = (...roles) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'Sign in required' });
  if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'Not allowed for your role' });
  next();
};

export const isMod = (u) => u && (u.role === 'moderator' || u.role === 'admin');
export const isVerifiedOfficial = (u, municipalityId) =>
  u && u.role === 'official' && u.verified && (!municipalityId || u.municipality_id === municipalityId);
