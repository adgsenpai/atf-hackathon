import { Router } from 'express';
import { q, one } from '../db.js';
import { ACK_STATUSES, STATUSES, refOf } from '../constants.js';
import { listParties, registryMeta } from './parties.js';

const r = Router();

async function getMuni(slug) {
  return one('SELECT * FROM municipalities WHERE slug=$1', [slug]);
}
const sourceOf = (muniId, dataset) =>
  one('SELECT source, url, last_checked, verification FROM dataset_sources WHERE municipality_id=$1 AND dataset=$2', [muniId, dataset]);

r.get('/municipalities', async (_req, res) => {
  res.json(await q(`SELECT m.*, (SELECT count(*) FROM reports r WHERE r.municipality_id=m.id AND NOT r.hidden) AS reports
                    FROM municipalities m ORDER BY name`));
});

r.get('/municipalities/:slug', async (req, res) => {
  const m = await getMuni(req.params.slug);
  if (!m) return res.status(404).json({ error: 'Municipality not found' });
  const [responsibilities, source, wards] = await Promise.all([
    q('SELECT * FROM responsibilities WHERE municipality_id=$1 ORDER BY sort', [m.id]),
    sourceOf(m.id, 'responsibilities'),
    q('SELECT id, code, name, suburb FROM wards WHERE municipality_id=$1 ORDER BY code', [m.id]),
  ]);
  res.json({ ...m, responsibilities, responsibilities_source: source, wards });
});

// Dataset A — official election results. Deliberately separate from council and performance.
r.get('/municipalities/:slug/elections', async (req, res) => {
  const m = await getMuni(req.params.slug);
  if (!m) return res.status(404).json({ error: 'Municipality not found' });
  const years = await q('SELECT id, year, level, is_sample FROM elections WHERE municipality_id=$1 ORDER BY year DESC', [m.id]);
  const chosen = years.find((y) => String(y.year) === String(req.query.year)) || years[0];
  if (!chosen) return res.json({ years: [], election: null, results: [], source: null });
  const rows = await q('SELECT party, votes, seats FROM election_results WHERE election_id=$1 ORDER BY sort', [chosen.id]);
  const total = rows.reduce((s, x) => s + x.votes, 0) || 1;
  res.json({
    years: years.map((y) => y.year),
    election: chosen,
    results: rows.map((x) => ({ ...x, share: Math.round((x.votes / total) * 1000) / 10 })),
    source: await sourceOf(m.id, 'elections'),
  });
});

// Dataset B — current council composition (dated snapshot).
r.get('/municipalities/:slug/council', async (req, res) => {
  const m = await getMuni(req.params.slug);
  if (!m) return res.status(404).json({ error: 'Municipality not found' });
  const snap = await one('SELECT * FROM council_snapshots WHERE municipality_id=$1 ORDER BY as_of DESC LIMIT 1', [m.id]);
  const seats = snap ? await q('SELECT party, seats_now, change FROM council_seats WHERE snapshot_id=$1 ORDER BY sort', [snap.id]) : [];
  const changes = await q('SELECT effective_date, description, source_url FROM council_changes WHERE municipality_id=$1 ORDER BY id', [m.id]);
  res.json({ snapshot: snap, seats, changes, source: await sourceOf(m.id, 'council'),
    rule: 'Current control is never inferred from historical election results.' });
});

// Real IEC party registry, scoped by registration level. Registry only: no votes, no seats, no inferred control.
const levelForKind = (kind = '') => (/metropolitan/i.test(kind) ? 'Metro' : 'District');
r.get('/municipalities/:slug/parties', async (req, res) => {
  const m = await getMuni(req.params.slug);
  if (!m) return res.status(404).json({ error: 'Municipality not found' });
  const level = levelForKind(m.kind);
  try {
    const [local, national, source] = await Promise.all([
      listParties({ level, limit: 200 }),
      listParties({ level: 'National', limit: 1 }),
      registryMeta(),
    ]);
    const place = m.name.replace(/^(City of|.* Metropolitan Municipality)\s*/i, '').trim().toUpperCase();
    const items = local.items.map((p) => ({ ...p, local_address: !!place && (p.address || '').toUpperCase().includes(place) }))
      .sort((a, b) => (b.local_address - a.local_address) || a.name.localeCompare(b.name));
    res.json({
      level, place, items, total: local.total, national_total: national.total, source,
      note: `The IEC register lists the level a party is registered at (${level}), not the specific municipality. "Registered address in ${place ? place.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) : 'this area'}" is based on the party's registered address only.`,
    });
  } catch (e) {
    if (e.status) return res.status(e.status === 404 ? 502 : e.status).json({ error: e.message });
    throw e;
  }
});

// ---------- Performance ----------
const iso = (d) => d.toISOString().slice(0, 10);
const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

async function performanceData(m, query) {
  const today = new Date();
  const to = query.to || iso(today);
  const from = query.from || iso(new Date(today.getTime() - 83 * 864e5));
  const params = [m.id, from, to];
  const where = ['r.municipality_id=$1', 'NOT r.hidden', 'r.observed_on BETWEEN $2 AND $3'];
  if (query.category && query.category !== 'all') { params.push(query.category); where.push(`r.category=$${params.length}`); }
  if (query.ward) { params.push(Number(query.ward)); where.push(`r.ward_id=$${params.length}`); }

  const reports = await q(
    `SELECT r.id, r.category, r.ward_id, w.name AS ward, r.observed_on, r.created_at, r.status, r.status_source, r.duplicate_of,
            (SELECT json_agg(json_build_object('status', e.status, 'source', e.source, 'at', e.created_at) ORDER BY e.created_at)
               FROM status_events e WHERE e.report_id=r.id AND e.state='approved') AS events
       FROM reports r LEFT JOIN wards w ON w.id=r.ward_id
      WHERE ${where.join(' AND ')}`, params);

  let rows = reports.map((r) => {
    const events = r.events || [];
    const ack = events.find((e) => ACK_STATUSES.includes(e.status));
    return {
      ...r,
      has_official: events.some((e) => e.source === 'official'),
      ack,
      ack_days: ack ? (new Date(ack.at) - new Date(r.created_at)) / 864e5 : null,
      reopened: events.some((e) => e.status === 'reopened'),
    };
  });
  if (query.source === 'official') rows = rows.filter((x) => x.has_official);
  if (query.source === 'user_reported') rows = rows.filter((x) => !x.has_official);

  const merged = rows.filter((x) => x.duplicate_of);
  const base = rows.filter((x) => !x.duplicate_of);
  const n = base.length;
  const acked = base.filter((x) => x.ack);
  const ackOfficial = acked.filter((x) => x.ack.source === 'official').length;
  const resolved = base.filter((x) => x.status === 'resolved');
  const resOfficial = resolved.filter((x) => x.status_source === 'official').length;
  const times = acked.map((x) => x.ack_days).filter((d) => d >= 0);
  const med = median(times);
  const reopened = base.filter((x) => x.reopened).length;

  const targets = await q(`SELECT * FROM service_targets WHERE municipality_id=$1 AND verified`, [m.id]);
  const period = `${from} to ${to}`;

  const metrics = [
    {
      key: 'received', title: 'Reports received', value: String(n), sub: 'in the selected period',
      period, included: n,
      method: 'Count of reports with an observed date in the period, duplicates merged.',
      source: 'Platform reports', missing: 'Reports not made on the platform are not counted.',
      verification: 'User-reported',
    },
    {
      key: 'acknowledged', title: 'Share acknowledged', value: `${pct(acked.length, n)}%`,
      sub: `acknowledgement = first status "Acknowledged" or later (${acked.length} of ${n})`,
      period, included: n,
      method: 'Acknowledged ÷ all reports, split by how it was recorded.',
      source: 'Status history', missing: 'No timestamp excluded from time metrics.',
      verification: `${pct(ackOfficial, acked.length)}% official response · ${pct(acked.length - ackOfficial, acked.length)}% user-reported`,
    },
    {
      key: 'median_ack', title: 'Median time to first acknowledgement',
      value: med === null ? 'No data' : `${med.toFixed(1)} days`, sub: 'only reports with an acknowledgement date',
      period, included: `${times.length} of ${n}`,
      method: 'Median of (first acknowledgement − submission time).',
      source: 'Status history', missing: `${n - times.length} reports excluded (no acknowledgement).`,
      verification: 'Mixed (see split above)',
    },
    {
      key: 'resolved', title: 'Share marked resolved', value: `${pct(resolved.length, n)}%`, sub: 'of reports in the period',
      period, included: n,
      method: 'Resolved ÷ all reports; reopened reports count as not resolved.',
      source: 'Status history', missing: 'Resolution may be unreported.',
      verification: `${pct(resOfficial, resolved.length)}% official · ${pct(resolved.length - resOfficial, resolved.length)}% user-reported`,
    },
    targets.length
      ? (() => {
        const tmap = Object.fromEntries(targets.map((t) => [t.category, t.target_days]));
        const withT = acked.filter((x) => tmap[x.category] != null);
        const overdue = withT.filter((x) => x.ack_days > tmap[x.category]).length;
        return {
          key: 'overdue', title: 'Overdue against a service target', value: `${pct(overdue, withT.length)}%`,
          sub: 'of reports in categories with a verified target', period, included: withT.length,
          method: 'Acknowledgement later than the official target time.', source: targets.map((t) => t.source).join('; '),
          missing: 'Categories without a verified target are excluded.', verification: 'Verified targets only',
        };
      })()
      : {
        key: 'overdue', title: 'Overdue against a service target', value: 'Not available',
        sub: 'No verified service target has been loaded for this category.', period: '—', included: '—',
        method: 'Shown only when an official target with a source exists.',
        source: '[target document, to be verified]', missing: '—', verification: 'To validate',
      },
    {
      key: 'reopened_dup', title: 'Reopened and duplicate reports', value: `${reopened} · ${merged.length}`,
      sub: 'reopened · merged duplicates', period, included: n + merged.length,
      method: 'Count of reports with a Reopened event; count merged as Duplicate.',
      source: 'Status history, moderator decisions', missing: 'None known.', verification: 'Moderator decisions',
    },
  ];

  // weekly buckets from `from`
  const start = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  const weeks = Math.max(1, Math.floor((end - start) / (7 * 864e5)) + 1);
  const weekly = Array.from({ length: Math.min(weeks, 53) }, (_, i) => ({
    week: `W${i + 1}`, start: iso(new Date(start.getTime() + i * 7 * 864e5)), official: 0, user_reported: 0,
  }));
  for (const x of base) {
    const i = Math.floor((new Date(`${x.observed_on}T00:00:00Z`) - start) / (7 * 864e5));
    if (weekly[i]) weekly[i][x.status_source === 'official' ? 'official' : 'user_reported']++;
  }

  return {
    municipality: { name: m.name, slug: m.slug },
    period: { from, to }, filters: query, metrics, weekly, rows,
    definitions: [
      { term: 'Acknowledged', definition: 'A status event recorded as "Acknowledged", either from an official response or reported by a resident with evidence.', status: 'Proposed' },
      { term: 'Resolved', definition: 'A status event recorded as "Resolved" and not followed by "Reopened".', status: 'Proposed' },
      { term: 'Median', definition: 'The middle value when all times are sorted. Less affected by a few very long cases than the average.', status: 'Standard' },
      { term: 'Service target', definition: 'An official target time for a service. Shown only if a verified source exists.', status: 'To validate' },
    ],
  };
}

r.get('/municipalities/:slug/performance', async (req, res) => {
  const m = await getMuni(req.params.slug);
  if (!m) return res.status(404).json({ error: 'Municipality not found' });
  const { rows, ...data } = await performanceData(m, req.query);
  res.json(data);
});

r.get('/municipalities/:slug/performance.csv', async (req, res) => {
  const m = await getMuni(req.params.slug);
  if (!m) return res.status(404).send('Municipality not found');
  const { rows } = await performanceData(m, req.query);
  const esc = (v) => (v == null ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  const header = ['ref', 'category', 'ward', 'observed_on', 'submitted_at', 'current_status', 'status_source',
    'first_ack_at', 'first_ack_source', 'days_to_ack', 'reopened', 'merged_duplicate_of'];
  const lines = [header.join(',')].concat(rows.map((x) => [
    refOf(x.id), x.category, x.ward, x.observed_on, new Date(x.created_at).toISOString(), STATUSES[x.status], x.status_source,
    x.ack ? new Date(x.ack.at).toISOString() : '', x.ack?.source || '', x.ack_days != null ? x.ack_days.toFixed(2) : '',
    x.reopened ? 'yes' : 'no', x.duplicate_of ? refOf(x.duplicate_of) : '',
  ].map(esc).join(',')));
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${m.slug}-reports.csv"`);
  res.send(`# CivicWatch Africa — resident-reported data, not an official performance rating. Sample data.\n${lines.join('\n')}\n`);
});

export default r;
