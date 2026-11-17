import { Router } from 'express';

// Real IEC party registry, served by the Rust iec-api (scraped from elections.org.za).
// This is registry data only: names, abbreviations, registration levels, contacts, logos.
// It never contains votes or seats, and nothing here is combined with results or performance.
const IEC_API_URL = (process.env.IEC_API_URL || 'http://iec-api:8080').replace(/\/$/, '');
const LOGO_BASE = process.env.IEC_LOGO_BASE || '/iec/';
const TTL_MS = Number(process.env.IEC_CACHE_MS) || 60_000;
export const LEVELS = ['National', 'Provincial', 'Metro', 'District', 'Municipal'];

const cache = new Map();

export async function iecGet(path) {
  const hit = cache.get(path);
  if (hit && hit.until > Date.now()) return hit.value;
  let res;
  try {
    res = await fetch(IEC_API_URL + path, { signal: AbortSignal.timeout(5000) });
  } catch {
    const err = new Error('The IEC party registry is unavailable right now. Please try again shortly.');
    err.status = 502;
    throw err;
  }
  const body = await res.json().catch(() => null);
  if (res.status === 404) {
    const err = new Error('Party not found');
    err.status = 404;
    throw err;
  }
  if (!res.ok || !body) {
    const err = new Error('The IEC party registry returned an error.');
    err.status = 502;
    throw err;
  }
  const value = { body };
  cache.set(path, { value, until: Date.now() + TTL_MS });
  if (cache.size > 500) cache.delete(cache.keys().next().value);
  return value;
}

export const shapeParty = (p) => ({
  id: p.id,
  name: p.name,
  abbreviation: p.abbreviation,
  display_name: p.display_name,
  levels: p.levels || [],
  contact_person: p.contact_person ?? null,
  telephone: p.telephone ?? null,
  email: p.email ?? null,
  address: p.address ?? null,
  website: p.website ?? null,
  logo: p.logo_file ? LOGO_BASE + p.logo_file.replace(/^\/+/, '') : null,
  source_logo_url: p.logo_url ?? null,
});

export async function registryMeta() {
  const { body } = await iecGet('/api/meta');
  return {
    source: 'Electoral Commission of South Africa (IEC) — registered political parties',
    url: body.source,
    scraped_at: body.scraped_at,
    count: body.count,
    logos: body.logos_downloaded,
  };
}

export async function listParties({ q, level, has_logo, limit, offset } = {}) {
  const p = new URLSearchParams();
  if (q) p.set('q', String(q).slice(0, 100));
  if (level && level !== 'all') {
    if (!LEVELS.includes(level)) {
      const err = new Error(`level must be one of: ${LEVELS.join(', ')}`);
      err.status = 400;
      throw err;
    }
    p.set('level', level);
  }
  if (has_logo === 'true' || has_logo === 'false') p.set('has_logo', has_logo);
  p.set('limit', String(Math.min(Math.max(Number(limit) || 24, 1), 200)));
  p.set('offset', String(Math.max(Number(offset) || 0, 0)));
  const { body } = await iecGet(`/api/parties?${p}`);
  return { items: body.items.map(shapeParty), total: body.total, limit: body.limit, offset: body.offset };
}

const r = Router();
const wrap = (fn) => (req, res, next) => fn(req, res).catch((e) => {
  if (e.status && e.status !== 500) return res.status(e.status).json({ error: e.message });
  next(e);
});

r.get('/parties/meta', wrap(async (_req, res) => {
  const [meta, levels] = await Promise.all([registryMeta(), iecGet('/api/levels')]);
  res.json({ ...meta, levels: levels.body });
}));

r.get('/parties', wrap(async (req, res) => {
  const [data, meta] = await Promise.all([listParties(req.query), registryMeta()]);
  res.json({ ...data, source: meta });
}));

r.get('/parties/:id', wrap(async (req, res) => {
  if (!/^[a-z0-9-]{1,200}$/i.test(req.params.id)) return res.status(404).json({ error: 'Party not found' });
  const [{ body }, meta] = await Promise.all([iecGet(`/api/parties/${encodeURIComponent(req.params.id)}`), registryMeta()]);
  res.json({ ...shapeParty(body), source: meta });
}));

export default r;
