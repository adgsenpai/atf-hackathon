import express from 'express';
import { waitForDb, pool } from './db.js';
import { loadUser } from './auth.js';
import authRoutes from './routes/auth.js';
import reportRoutes, { UPLOAD_DIR } from './routes/reports.js';
import muniRoutes from './routes/municipalities.js';
import modRoutes from './routes/moderation.js';
import partyRoutes from './routes/parties.js';
import { seedIfEmpty } from './seed.js';
import { loadRealDataIfEmpty } from './realdata.js';

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '200kb' }));
app.use(loadUser);

app.get('/api/health', async (_req, res) => {
  await pool.query('SELECT 1');
  res.json({ ok: true });
});

app.use('/api', authRoutes, reportRoutes, muniRoutes, modRoutes, partyRoutes);
app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '7d', fallthrough: false }));
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  if (err?.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'Each photo must be 8 MB or smaller.' });
  if (err?.code === 'LIMIT_FILE_COUNT' || err?.code === 'LIMIT_UNEXPECTED_FILE') return res.status(400).json({ error: 'Up to 4 photos at a time.' });
  if (err?.code === '22P02') return res.status(400).json({ error: 'Invalid identifier.' });
  if (err?.status === 404) return res.status(404).json({ error: 'Not found' });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong.' });
});

const port = Number(process.env.PORT) || 4000;
await waitForDb();
await loadRealDataIfEmpty();
await seedIfEmpty();
app.listen(port, () => console.log(`CivicWatch API listening on :${port}`));
