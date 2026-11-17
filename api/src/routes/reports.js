import { Router } from 'express';
import multer from 'multer';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { q, one, tx } from '../db.js';
import { requireUser, isMod, isVerifiedOfficial } from '../auth.js';
import { STATUSES, FLAG_REASONS, piiError, refOf } from '../constants.js';
import { stripMetadata } from '../metadata.js';

export const UPLOAD_DIR = process.env.UPLOAD_DIR || '/data/uploads';
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024, files: 4 } });
const r = Router();

// ---------- helpers ----------
const coarse = (v) => Math.round(v * 100) / 100; // ~1 km

function shapeReport(row, viewer) {
  const canSeeExact = viewer && (viewer.id === row.author_id || isMod(viewer));
  const hideExact = row.sensitive && !canSeeExact;
  return {
    id: row.id,
    ref: refOf(row.id),
    category: row.category,
    category_name: row.category_name,
    title: row.title,
    description: row.description,
    street: hideExact ? null : row.street,
    suburb: row.suburb || null,
    ward: row.ward_name || null,
    ward_id: row.ward_id,
    municipality: row.municipality_name || null,
    municipality_slug: row.municipality_slug || null,
    municipality_id: row.municipality_id,
    lat: hideExact ? coarse(row.lat) : row.lat,
    lng: hideExact ? coarse(row.lng) : row.lng,
    precision: row.sensitive ? 'reduced' : 'exact',
    sensitive: row.sensitive,
    observed_on: row.observed_on,
    created_at: row.created_at,
    status: row.status,
    status_label: STATUSES[row.status],
    status_source: row.status_source,
    status_changed_at: row.status_changed_at,
    municipality_responded: row.status_source === 'official' || !!row.has_official_reply,
    sent_to_municipality: row.sent_to_municipality,
    followers: row.followers ?? 0,
    updates: row.updates ?? 0,
    is_sample: row.is_sample,
    is_author: !!viewer && viewer.id === row.author_id,
  };
}

const BASE_SELECT = `
  SELECT r.*, c.name AS category_name, w.name AS ward_name, w.suburb,
         m.name AS municipality_name, m.slug AS municipality_slug,
         (SELECT count(*) FROM follows f WHERE f.report_id = r.id) AS followers,
         (SELECT count(*) FROM status_events e WHERE e.report_id = r.id AND e.state='approved' AND e.status <> 'submitted')
           + (SELECT count(*) FROM comments k WHERE k.report_id = r.id AND k.state <> 'removed') AS updates,
         EXISTS (SELECT 1 FROM comments k WHERE k.report_id = r.id AND k.is_official AND k.state='visible') AS has_official_reply
  FROM reports r
  JOIN categories c ON c.slug = r.category
  LEFT JOIN wards w ON w.id = r.ward_id
  LEFT JOIN municipalities m ON m.id = r.municipality_id`;

async function applyStatus(t, reportId, status, source) {
  await t.q(
    `UPDATE reports SET status=$2, status_source=$3, status_changed_at=now() WHERE id=$1`,
    [reportId, status, source]
  );
}

// ---------- reference ----------
r.get('/categories', async (_req, res) => res.json(await q('SELECT * FROM categories ORDER BY sort')));

// Ward list for filters (geometry is served by /api/geo/wards). Optional ?municipality=<slug>.
r.get('/wards', async (req, res) => {
  const params = [];
  let where = '';
  if (req.query.municipality) { params.push(req.query.municipality); where = 'WHERE m.slug=$1'; }
  res.json(await q(`SELECT w.id, w.code, w.ward_no, w.name, w.suburb, w.municipality_id, m.name AS municipality, m.slug AS municipality_slug
                      FROM wards w JOIN municipalities m ON m.id=w.municipality_id ${where} ORDER BY m.code, w.ward_no`, params));
});

r.get('/geo/lookup', async (req, res) => {
  const lat = Number(req.query.lat), lng = Number(req.query.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return res.status(400).json({ error: 'lat and lng required' });
  const row = await one(
    `SELECT w.id AS ward_id, w.name AS ward, w.suburb, m.id AS municipality_id, m.name AS municipality, m.integration
       FROM wards w JOIN municipalities m ON m.id = w.municipality_id
      WHERE ST_Contains(w.geom, ST_SetSRID(ST_MakePoint($2, $1), 4326)) LIMIT 1`, [lat, lng]);
  res.json(row || { ward_id: null, ward: null, suburb: null, municipality_id: null, municipality: null, integration: false });
});

// ---------- list ----------
r.get('/reports', async (req, res) => {
  const where = ['r.hidden = false', 'r.duplicate_of IS NULL'];
  const params = [];
  const add = (sql, v) => { params.push(v); where.push(sql.replace('?', `$${params.length}`)); };
  const { q: text, category, status, ward, days, municipality } = req.query;
  if (text) add(`(r.title || ' ' || r.description || ' ' || coalesce(r.street,'') || ' ' || coalesce(w.suburb,'') || ' ' || coalesce(w.name,'') || ' ' || coalesce(m.name,'')) ILIKE ?`, `%${text}%`);
  if (category && category !== 'all') add('r.category = ?', category);
  if (status === 'open') where.push(`r.status IN ('submitted','acknowledged','in_progress')`);
  else if (status && status !== 'all') add('r.status = ?', status);
  if (ward) add('r.ward_id = ?', Number(ward));
  if (municipality) add('m.slug = ?', municipality);
  if (days && Number(days) > 0) add(`r.observed_on >= current_date - (?::int)`, Number(days));
  const limit = Math.min(Number(req.query.limit) || 20, 500);
  const offset = Number(req.query.offset) || 0;
  const whereSql = where.join(' AND ');
  const [{ count }] = await q(
    `SELECT count(*) FROM reports r LEFT JOIN wards w ON w.id=r.ward_id LEFT JOIN municipalities m ON m.id=r.municipality_id WHERE ${whereSql}`, params);
  const rows = await q(`${BASE_SELECT} WHERE ${whereSql} ORDER BY r.observed_on DESC, r.id DESC LIMIT ${limit} OFFSET ${offset}`, params);
  res.json({ total: count, items: rows.map((x) => shapeReport(x, req.user)) });
});

// ---------- create ----------
r.post('/reports', requireUser, async (req, res) => {
  const { category, title, description, street, lat, lng, sensitive, observed_on } = req.body || {};
  const errors = {};
  if (!category) errors.category = 'Choose what kind of problem it is.';
  if (!title || title.trim().length < 5) errors.title = 'Give a short title (at least 5 characters).';
  if (!description || description.trim().length < 10) errors.description = 'Describe the problem (at least 10 characters).';
  const pii = piiError(`${title} ${description} ${street}`);
  if (pii) errors.description = pii;
  if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) errors.location = 'Place the pin on the map.';
  if (!observed_on || new Date(observed_on) > new Date()) errors.observed_on = 'Date observed cannot be in the future.';
  if (Object.keys(errors).length) return res.status(400).json({ error: 'Please fix the highlighted fields.', fields: errors });
  if (!(await one('SELECT 1 FROM categories WHERE slug=$1', [category]))) return res.status(400).json({ error: 'Unknown category' });

  const report = await tx(async (t) => {
    const geo = await t.one(
      `SELECT w.id AS ward_id, w.municipality_id FROM wards w
        WHERE ST_Contains(w.geom, ST_SetSRID(ST_MakePoint($2,$1),4326)) LIMIT 1`, [Number(lat), Number(lng)]);
    const rep = await t.one(
      `INSERT INTO reports (author_id, municipality_id, ward_id, category, title, description, street, lat, lng, sensitive, observed_on)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
      [req.user.id, geo?.municipality_id ?? null, geo?.ward_id ?? null, category, title.trim(), description.trim(),
        street?.trim() || null, Number(lat), Number(lng), !!sensitive, observed_on]);
    await t.q(`INSERT INTO status_events (report_id, status, source, recorded_by, recorder_kind) VALUES ($1,'submitted','user_reported',$2,'author')`,
      [rep.id, req.user.id]);
    await t.q('INSERT INTO follows (user_id, report_id) VALUES ($1,$2)', [req.user.id, rep.id]);
    return rep;
  });
  const row = await one(`${BASE_SELECT} WHERE r.id=$1`, [report.id]);
  res.status(201).json(shapeReport(row, req.user));
});

// ---------- photos ----------
r.post('/reports/:id/photos', requireUser, upload.array('photos', 4), async (req, res) => {
  const rep = await one('SELECT id, author_id FROM reports WHERE id=$1 AND hidden=false', [req.params.id]);
  if (!rep) return res.status(404).json({ error: 'Report not found' });
  const [{ count }] = await q('SELECT count(*) FROM report_photos WHERE report_id=$1 AND hidden=false', [rep.id]);
  if (count + (req.files?.length || 0) > 12) return res.status(400).json({ error: 'This report already has the maximum number of photos.' });
  const kind = rep.author_id === req.user.id ? 'author' : 'community';
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  const saved = [];
  for (const f of req.files || []) {
    const { type, data } = stripMetadata(f.buffer);
    if (!type) return res.status(400).json({ error: `${f.originalname}: only valid JPEG and PNG images are accepted.` });
    const name = `${crypto.randomUUID()}.${type}`;
    await fs.writeFile(path.join(UPLOAD_DIR, name), data);
    saved.push(await one(`INSERT INTO report_photos (report_id, user_id, path, kind) VALUES ($1,$2,$3,$4) RETURNING *`,
      [rep.id, req.user.id, `/uploads/${name}`, kind]));
  }
  res.status(201).json(saved);
});

// ---------- detail ----------
r.get('/reports/:id', async (req, res) => {
  const row = await one(`${BASE_SELECT} WHERE r.id=$1`, [req.params.id]);
  if (!row || (row.hidden && !isMod(req.user))) return res.status(404).json({ error: 'Report not found' });
  const report = shapeReport(row, req.user);
  const id = row.id;

  const [photos, events, stats, responsibility, viewer, pending] = await Promise.all([
    q(`SELECT id, path, kind, created_at FROM report_photos WHERE report_id=$1 AND hidden=false ORDER BY created_at`, [id]),
    q(`SELECT id, status, source, recorder_kind, note, evidence, reference, created_at
         FROM status_events WHERE report_id=$1 AND state='approved' ORDER BY created_at`, [id]),
    one(`SELECT (SELECT count(*) FROM same_problem WHERE report_id=$1) AS same,
                (SELECT count(*) FROM reports WHERE duplicate_of=$1) AS duplicates,
                (SELECT count(*) FROM status_events WHERE report_id=$1 AND status='reopened' AND state='approved') AS reopened,
                (SELECT count(*) FROM status_events WHERE report_id=$1 AND state='pending') AS pending`, [id]),
    row.municipality_id
      ? one(`SELECT r.*, s.source, s.url, s.last_checked, s.verification AS source_verification
               FROM responsibilities r LEFT JOIN dataset_sources s ON s.municipality_id=r.municipality_id AND s.dataset='responsibilities'
              WHERE r.municipality_id=$1 AND $2 = ANY(r.categories) LIMIT 1`, [row.municipality_id, row.category])
      : null,
    req.user
      ? one(`SELECT EXISTS(SELECT 1 FROM follows WHERE user_id=$1 AND report_id=$2) AS following,
                    EXISTS(SELECT 1 FROM same_problem WHERE user_id=$1 AND report_id=$2) AS same`, [req.user.id, id])
      : { following: false, same: false },
    req.user
      ? q(`SELECT id, status, note, created_at FROM status_events WHERE report_id=$1 AND state='pending' AND recorded_by=$2`, [id, req.user.id])
      : [],
  ]);

  res.json({
    ...report,
    photos,
    events: events.map((e) => ({ ...e, status_label: STATUSES[e.status] })),
    same: stats.same, duplicates: stats.duplicates, reopened: stats.reopened, pending_proposals: stats.pending,
    my_pending: pending,
    responsibility,
    viewer: {
      ...viewer,
      can_set_official_status: isVerifiedOfficial(req.user, row.municipality_id),
      is_mod: isMod(req.user),
    },
  });
});

// ---------- follow / same problem ----------
r.post('/reports/:id/follow', requireUser, async (req, res) => {
  await q('INSERT INTO follows (user_id, report_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [req.user.id, req.params.id]);
  res.json({ following: true });
});
r.delete('/reports/:id/follow', requireUser, async (req, res) => {
  await q('DELETE FROM follows WHERE user_id=$1 AND report_id=$2', [req.user.id, req.params.id]);
  res.json({ following: false });
});
r.post('/reports/:id/same', requireUser, async (req, res) => {
  const exists = await one('SELECT 1 FROM same_problem WHERE user_id=$1 AND report_id=$2', [req.user.id, req.params.id]);
  if (exists) await q('DELETE FROM same_problem WHERE user_id=$1 AND report_id=$2', [req.user.id, req.params.id]);
  else {
    await q('INSERT INTO same_problem (user_id, report_id) VALUES ($1,$2)', [req.user.id, req.params.id]);
    await q('INSERT INTO follows (user_id, report_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [req.user.id, req.params.id]);
  }
  res.json({ same: !exists });
});

// ---------- status changes ----------
r.post('/reports/:id/status', requireUser, async (req, res) => {
  const { status, note, evidence, reference } = req.body || {};
  if (!STATUSES[status] || status === 'submitted' || status === 'duplicate')
    return res.status(400).json({ error: 'Choose a valid status.' });
  const rep = await one('SELECT * FROM reports WHERE id=$1 AND hidden=false', [req.params.id]);
  if (!rep) return res.status(404).json({ error: 'Report not found' });
  const pii = piiError(`${note} ${evidence}`);
  if (pii) return res.status(400).json({ error: pii });

  const official = isVerifiedOfficial(req.user, rep.municipality_id);
  const mod = isMod(req.user);
  if (!official && !mod && !(note || '').trim() && !(evidence || '').trim())
    return res.status(400).json({ error: 'Add a note or evidence so moderators can check the change.' });

  const kind = official ? 'official' : mod ? 'moderator' : rep.author_id === req.user.id ? 'author' : 'community';
  const source = official ? 'official' : 'user_reported';
  const state = official || mod ? 'approved' : 'pending';

  const ev = await tx(async (t) => {
    const e = await t.one(
      `INSERT INTO status_events (report_id, status, source, recorded_by, recorder_kind, note, evidence, reference, state)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [rep.id, status, source, req.user.id, kind, note || null, evidence || null, reference || null, state]);
    if (state === 'approved') await applyStatus(t, rep.id, status, source);
    return e;
  });
  res.status(201).json({ ...ev, message: state === 'pending'
    ? 'Thanks. Your proposed status change will be shown after a moderator reviews it.'
    : 'Status updated.' });
});

// ---------- comments ----------
r.get('/reports/:id/comments', async (req, res) => {
  const rows = await q(
    `SELECT k.*, u.pseudonym, u.role, u.verified,
            (SELECT count(*) FROM comment_votes v WHERE v.comment_id=k.id) AS helpful,
            ${req.user ? `EXISTS(SELECT 1 FROM comment_votes v WHERE v.comment_id=k.id AND v.user_id=${Number(req.user.id)})` : 'false'} AS voted,
            (SELECT a.id FROM moderation_actions a WHERE a.target_type='comment' AND a.target_id=k.id
               AND a.action IN ('remove','redact') ORDER BY a.id DESC LIMIT 1) AS action_id
       FROM comments k JOIN users u ON u.id=k.user_id
      WHERE k.report_id=$1 ORDER BY k.created_at`, [req.params.id]);
  const items = rows.map((k) => {
    const mine = req.user && req.user.id === k.user_id;
    const removed = k.state === 'removed';
    return {
      id: k.id, parent_id: k.parent_id, created_at: k.created_at,
      author: k.is_official ? 'Municipality representative' : k.pseudonym,
      is_official: k.is_official,
      verified: k.is_official && k.verified,
      body: removed && !isMod(req.user) ? null : k.body,
      state: k.state,
      removed_rule: k.removed_rule,
      helpful: k.helpful, voted: k.voted, mine,
      appeal_action_id: mine && k.state !== 'visible' ? k.action_id : null,
    };
  });
  res.json(items);
});

r.post('/reports/:id/comments', requireUser, async (req, res) => {
  const { body, parent_id } = req.body || {};
  if (!body || body.trim().length < 2) return res.status(400).json({ error: 'Write a comment first.' });
  const pii = piiError(body);
  if (pii) return res.status(400).json({ error: pii });
  const rep = await one('SELECT id, municipality_id FROM reports WHERE id=$1 AND hidden=false', [req.params.id]);
  if (!rep) return res.status(404).json({ error: 'Report not found' });
  if (parent_id) {
    const parent = await one('SELECT parent_id FROM comments WHERE id=$1 AND report_id=$2', [parent_id, rep.id]);
    if (!parent) return res.status(400).json({ error: 'Reply target not found' });
  }
  const recent = await one(`SELECT count(*) FROM comments WHERE user_id=$1 AND created_at > now() - interval '1 minute'`, [req.user.id]);
  if (recent.count >= 5) return res.status(429).json({ error: 'You are commenting too fast. Please wait a minute.' });
  const official = isVerifiedOfficial(req.user, rep.municipality_id);
  const c = await one(
    `INSERT INTO comments (report_id, parent_id, user_id, body, is_official) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [rep.id, parent_id || null, req.user.id, body.trim(), official]);
  res.status(201).json(c);
});

r.post('/comments/:id/helpful', requireUser, async (req, res) => {
  const exists = await one('SELECT 1 FROM comment_votes WHERE user_id=$1 AND comment_id=$2', [req.user.id, req.params.id]);
  if (exists) await q('DELETE FROM comment_votes WHERE user_id=$1 AND comment_id=$2', [req.user.id, req.params.id]);
  else await q('INSERT INTO comment_votes (user_id, comment_id) VALUES ($1,$2)', [req.user.id, req.params.id]);
  res.json({ voted: !exists });
});

// ---------- flags, corrections, appeals ----------
r.get('/flag-reasons', (_req, res) => res.json(FLAG_REASONS));

r.post('/flags', requireUser, async (req, res) => {
  const { target_type, target_id, reason, details } = req.body || {};
  if (!['report', 'comment', 'photo'].includes(target_type)) return res.status(400).json({ error: 'Invalid target' });
  if (!FLAG_REASONS[reason]) return res.status(400).json({ error: 'Choose a reason' });
  const dup = await one(`SELECT 1 FROM flags WHERE user_id=$1 AND target_type=$2 AND target_id=$3 AND state='open'`,
    [req.user.id, target_type, target_id]);
  if (dup) return res.status(409).json({ error: 'You have already flagged this.' });
  await q(`INSERT INTO flags (target_type, target_id, user_id, reason, details) VALUES ($1,$2,$3,$4,$5)`,
    [target_type, Number(target_id), req.user.id, reason, details || null]);
  res.status(201).json({ message: 'Thanks. A moderator will review this.' });
});

r.post('/corrections', requireUser, async (req, res) => {
  const { target_type, target_id, details } = req.body || {};
  if (!details || details.trim().length < 10) return res.status(400).json({ error: 'Explain what should be corrected (at least 10 characters).' });
  await q(`INSERT INTO corrections (target_type, target_id, user_id, details) VALUES ($1,$2,$3,$4)`,
    [target_type || 'report', Number(target_id) || 0, req.user.id, details.trim()]);
  res.status(201).json({ message: 'Correction request received. Moderators will review it.' });
});

r.post('/appeals', requireUser, async (req, res) => {
  const { action_id, reason } = req.body || {};
  const action = await one('SELECT * FROM moderation_actions WHERE id=$1', [action_id]);
  if (!action) return res.status(404).json({ error: 'Decision not found' });
  const owner = action.target_type === 'comment'
    ? await one('SELECT user_id FROM comments WHERE id=$1', [action.target_id])
    : action.target_type === 'report'
      ? await one('SELECT author_id AS user_id FROM reports WHERE id=$1', [action.target_id])
      : await one('SELECT user_id FROM report_photos WHERE id=$1', [action.target_id]);
  if (!owner || owner.user_id !== req.user.id) return res.status(403).json({ error: 'You can only appeal decisions about your own content.' });
  if (await one(`SELECT 1 FROM appeals WHERE action_id=$1 AND state='open'`, [action_id]))
    return res.status(409).json({ error: 'An appeal is already open for this decision.' });
  if (!reason || reason.trim().length < 10) return res.status(400).json({ error: 'Explain why the decision should change.' });
  await q('INSERT INTO appeals (action_id, user_id, reason) VALUES ($1,$2,$3)', [action_id, req.user.id, reason.trim()]);
  res.status(201).json({ message: 'Appeal submitted. A different moderator will review it.' });
});

export default r;
