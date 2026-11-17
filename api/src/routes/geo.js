import { Router } from 'express';
import { q, one } from '../db.js';
import { ACK_STATUSES } from '../constants.js';

// Real boundaries (MDB via OpenUp MapIt) as GeoJSON for the map, with live report counts.
const r = Router();
const fc = (rows) => ({ type: 'FeatureCollection', features: rows.map(({ geometry, ...properties }) => ({ type: 'Feature', geometry, properties })) });
const OPEN = `('submitted','acknowledged','in_progress','reopened','needs_info')`;

r.get('/geo/region', async (_req, res) => {
  const rows = await q(`SELECT code, name, ST_AsGeoJSON(geom, 5)::json AS geometry FROM regions`);
  const src = await one(`SELECT source, url, fetched_at, detail FROM data_imports WHERE dataset='boundaries'`);
  res.json({ ...fc(rows), source: src });
});

r.get('/geo/municipalities', async (req, res) => {
  const cat = req.query.category === 'C' ? `m.category='C'` : `m.category IN ('A','B')`;
  const rows = await q(
    `SELECT m.id, m.slug, m.name, m.code, m.category, m.district_code, d.name AS district, m.ward_count,
            count(r.id) FILTER (WHERE NOT r.hidden AND r.duplicate_of IS NULL)::int AS reports,
            count(r.id) FILTER (WHERE NOT r.hidden AND r.duplicate_of IS NULL AND r.status IN ${OPEN})::int AS open,
            count(r.id) FILTER (WHERE NOT r.hidden AND r.duplicate_of IS NULL AND r.status='resolved')::int AS resolved,
            ST_AsGeoJSON(m.geom, 4)::json AS geometry
       FROM municipalities m
       LEFT JOIN municipalities d ON d.code = m.district_code
       LEFT JOIN reports r ON r.municipality_id = m.id
      WHERE ${cat} AND m.geom IS NOT NULL
      GROUP BY m.id, d.name ORDER BY m.code`);
  res.json(fc(rows));
});

r.get('/geo/wards', async (req, res) => {
  const m = await one('SELECT id, name, slug FROM municipalities WHERE slug=$1', [req.query.municipality || '']);
  if (!m) return res.status(400).json({ error: 'municipality (slug) is required' });
  const rows = await q(
    `SELECT w.id, w.code, w.ward_no, w.name, h.party AS demo_party,
            count(r.id) FILTER (WHERE NOT r.hidden AND r.duplicate_of IS NULL)::int AS reports,
            count(r.id) FILTER (WHERE NOT r.hidden AND r.duplicate_of IS NULL AND r.status IN ${OPEN})::int AS open,
            count(r.id) FILTER (WHERE NOT r.hidden AND r.duplicate_of IS NULL AND r.status='resolved')::int AS resolved,
            ST_AsGeoJSON(w.geom, 5)::json AS geometry
       FROM wards w
       LEFT JOIN demo_ward_holders h ON h.ward_id = w.id
       LEFT JOIN reports r ON r.ward_id = w.id
      WHERE w.municipality_id=$1 GROUP BY w.id, h.party ORDER BY w.ward_no`, [m.id]);
  res.json({ municipality: m, ...fc(rows) });
});

r.get('/stats', async (_req, res) => {
  const row = await one(`SELECT
      (SELECT count(*)::int FROM municipalities) AS councils,
      (SELECT count(*)::int FROM municipalities WHERE category IN ('A','B')) AS municipalities,
      (SELECT count(*)::int FROM wards) AS wards,
      (SELECT count(*)::int FROM reports WHERE NOT hidden AND duplicate_of IS NULL) AS reports,
      (SELECT count(*)::int FROM reports WHERE NOT hidden AND duplicate_of IS NULL AND status='resolved') AS resolved,
      (SELECT count(*)::int FROM reports WHERE NOT hidden AND duplicate_of IS NULL AND status IN ${OPEN}) AS open,
      (SELECT max(year) FROM elections WHERE NOT is_sample) AS latest_election,
      (SELECT sum(seats_total)::int FROM elections e WHERE NOT is_sample AND year=(SELECT max(year) FROM elections) AND NOT district_40pct) AS seats_latest`);
  const sources = await q('SELECT dataset, source, url, fetched_at, detail FROM data_imports ORDER BY dataset');
  res.json({ ...row, sources });
});

// ---------- DEMO accountability showcase ----------
// Fictional parties hold wards (demo_ward_holders). Every party is measured the same way, listed
// alphabetically, with no ranking and no single score. Clearly labelled demo data.
const UNATTENDED_DAYS = 14;
r.get('/municipalities/:slug/accountability', async (req, res) => {
  const m = await one('SELECT id, name, slug FROM municipalities WHERE slug=$1', [req.params.slug]);
  if (!m) return res.status(404).json({ error: 'Municipality not found' });
  const rows = await q(
    `SELECT h.party, w.id AS ward_id, w.ward_no, r.id, r.title, r.category, r.status, r.created_at,
            (SELECT min(e.created_at) FROM status_events e WHERE e.report_id=r.id AND e.state='approved' AND e.status = ANY($2)) AS ack_at
       FROM demo_ward_holders h
       JOIN wards w ON w.id=h.ward_id
       LEFT JOIN reports r ON r.ward_id=w.id AND NOT r.hidden AND r.duplicate_of IS NULL
      WHERE w.municipality_id=$1`, [m.id, ACK_STATUSES]);
  const now = Date.now();
  const parties = {};
  for (const x of rows) {
    const p = (parties[x.party] ||= { party: x.party, wards: new Set(), reports: 0, acknowledged: 0, ack_within_7: 0, resolved: 0, unattended: 0, ack_days: [], did: [], did_not: [] });
    p.wards.add(x.ward_no);
    if (!x.id) continue;
    p.reports++;
    const ageDays = (now - new Date(x.created_at)) / 864e5;
    if (x.ack_at) {
      p.acknowledged++;
      const d = (new Date(x.ack_at) - new Date(x.created_at)) / 864e5;
      p.ack_days.push(d);
      if (d <= 7) p.ack_within_7++;
    }
    if (x.status === 'resolved') {
      p.resolved++;
      if (p.did.length < 4) p.did.push({ id: x.id, title: x.title, ward_no: x.ward_no });
    } else if (!x.ack_at && ageDays > UNATTENDED_DAYS) {
      p.unattended++;
      if (p.did_not.length < 4) p.did_not.push({ id: x.id, title: x.title, ward_no: x.ward_no, days: Math.round(ageDays) });
    }
  }
  const med = (xs) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); const i = Math.floor(s.length / 2); return s.length % 2 ? s[i] : (s[i - 1] + s[i]) / 2; };
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : null);
  const items = Object.values(parties).sort((a, b) => a.party.localeCompare(b.party)).map((p) => ({
    party: p.party, wards: p.wards.size, reports: p.reports,
    acknowledged_pct: pct(p.acknowledged, p.reports), ack_within_7_pct: pct(p.ack_within_7, p.reports),
    resolved_pct: pct(p.resolved, p.reports), unattended: p.unattended, unattended_pct: pct(p.unattended, p.reports),
    median_ack_days: med(p.ack_days) == null ? null : Math.round(med(p.ack_days) * 10) / 10,
    did: p.did, did_not: p.did_not,
  }));
  res.json({
    demo: true, municipality: m, unattended_days: UNATTENDED_DAYS, items,
    method: `Each ward is assigned to a fictional demo party (round-robin, equal shares). For every party we count the demo reports in its wards: acknowledged (any acknowledgement), acknowledged within 7 days, resolved, and unattended (no acknowledgement after ${UNATTENDED_DAYS} days). The same rules apply to every party; parties are listed alphabetically and are never ranked or scored.`,
    disclaimer: 'Demo data. These parties are fictional and the reports are generated for the hackathon demo. Nothing here describes any real party or councillor.',
  });
});

export default r;
