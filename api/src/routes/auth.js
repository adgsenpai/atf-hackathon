import { Router } from 'express';
import crypto from 'node:crypto';
import { one } from '../db.js';
import { hashPassword, verifyPassword, signToken, publicUser, requireUser } from '../auth.js';

const r = Router();

r.post('/auth/register', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  if (await one('SELECT 1 FROM users WHERE email=$1', [email])) return res.status(409).json({ error: 'An account with this email already exists.' });
  const pseudonym = `Resident ${crypto.randomInt(100, 1000)}`;
  const user = await one(`INSERT INTO users (email, password_hash, pseudonym) VALUES ($1,$2,$3) RETURNING *`,
    [email, hashPassword(password), pseudonym]);
  res.status(201).json({ token: signToken(user), user: publicUser(user) });
});

r.post('/auth/login', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const user = await one('SELECT * FROM users WHERE email=$1', [email]);
  if (!user || !verifyPassword(String(req.body?.password || ''), user.password_hash))
    return res.status(401).json({ error: 'Email or password is incorrect.' });
  res.json({ token: signToken(user), user: publicUser(user) });
});

r.get('/auth/me', requireUser, (req, res) => res.json(publicUser(req.user)));

export default r;
