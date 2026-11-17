import { Router } from 'express';
import { q, one, tx } from '../db.js';
import { requireRole } from '../auth.js';
import { FLAG_REASONS, HIGH_PRIORITY_REASONS, REASON_CODES, STATUSES, refOf } from '../constants.js';

const r = Router();
r.use('/mod', requireRole('moderator', 'admin'));

const ACTIONS = {
  comment: ['keep', 'redact', 'remove', 'warn', 'escalate'],
  photo: ['keep', 'remove', 'warn', 'escalate'],
  report: ['keep', 'redact', 'remove', 'duplicate', 'warn', 'escalate'],
  status: ['approve', 'reject', 'escalate'],
};

async function loadTarget(t, type, id) {
  if (type === 'comment') return t.one(`SELECT k.*, k.user_id AS author_id, r.title AS report_title FROM comments k JOIN reports r ON r.id=k.report_id WHERE k.id=$1`, [id]);
  if (type === 'photo') return t.one(`SELECT p.*, p.user_id AS author_id, r.title AS report_title FROM report_photos p JOIN reports r ON r.id=p.report_id WHERE p.id=$1`, [id]);
  if (type === 'report') return t.one(`SELECT r.*, r.id AS report_id, r.title AS report_title FROM reports r WHERE r.id=$1`, [id]);
  if (type === 'status') return t.one(`SELECT e.*, e.recorded_by AS author_id, r.title AS report_title, r.status AS current_status FROM status_events e JOIN reports r ON r.id=e.report_id WHERE e.id=$1`, [id]);
  return null;
}
const db = { q, one };

function summarize(type, target, reasons) {
  if (type === 'status') return `Proposed "${STATUSES[target.status]}"${target.evidence ? '' : ' without evidence'}`;
  if (type === 'report' && reasons.includes('duplicate')) return 'Possible duplicate report';
  if (type === 'photo' && reasons.includes('privacy')) return 'Photo may show a house number or a face';
  const top = Object.entries(reasons.reduce((a, x) => ({ ...a, [x]: (a[x] || 0) + 1 }), {})).sort((a, b) => b[1] - a[1])[0];
  return top ? FLAG_REASONS[top[0]] : 'Flagged';
}

async function queueItems() {
  const groups = await q(
    `SELECT target_type AS type, target_id AS id, count(*) AS flags, count(DISTINCT user_id) AS flaggers,
            min(created_at) AS oldest, array_agg(reason) AS reasons
       FROM flags WHERE state='open' GROUP BY 1,2`);
  const pending = await q(`SELECT 'status' AS type, id, 0 AS flags, 0 AS flaggers, created_at AS oldest, ARRAY['no_evidence'] AS reasons
                             FROM status_events WHERE state='pending'`);
  const escalated = new Set((await q(`SELECT target_type, target_id FROM escalations WHERE state='open'`)).map((e) => `${e.target_type}:${e.target_id}`));
  const items = [];
  for (const g of [...groups, ...pending]) {
    const t = await loadTarget(db, g.type, g.id);
    if (!t) continue;
    const high = g.flaggers >= 3 || g.reasons.some((x) => HIGH_PRIORITY_REASONS.has(x));
    items.push({
      key: `${g.type}:${g.id}`, type: g.type, id: g.id,
      priority: high ? 'high' : 'normal',
      summary: summarize(g.type, t, g.reasons),
      flags: g.flags, flaggers: g.flaggers, reasons: [...new Set(g.reasons)],
      report_id: t.report_id, report_ref: refOf(t.report_id), report_title: t.report_title,
      oldest: g.oldest, escalated: escalated.has(`${g.type}:${g.id}`),
    });
  }
  return items;
}

r.get('/mod/meta', (_req, res) => res.json({ reason_codes: REASON_CODES, flag_reasons: FLAG_REASONS, actions: ACTIONS }));

r.get('/mod/stats', async (_req, res) => {
  const s = await one(`SELECT
      (SELECT count(*) FROM flags WHERE state='open') AS open_flags,
      (SELECT count(*) FROM escalations WHERE state='open') AS needs_second,
      (SELECT count(*) FROM appeals WHERE state='open') AS open_appeals,
      (SELECT count(*) FROM corrections WHERE state='open') AS open_corrections,
      (SELECT count(*) FROM status_events WHERE state='pending') AS pending_status,
      (SELECT extract(epoch FROM now() - min(t)) / 3600 FROM (
         SELECT created_at t FROM flags WHERE state='open' UNION ALL SELECT created_at FROM status_events WHERE state='pending') x) AS oldest_hours`);
  res.json({ ...s, oldest_hours: s.oldest_hours == null ? 0 : Math.round(s.oldest_hours) });
});

r.get('/mod/queue', async (req, res) => {
  let items = await queueItems();
  const { type, reason, sort } = req.query;
  if (type && type !== 'all') items = items.filter((x) => x.type === type);
  if (reason && reason !== 'all') items = items.filter((x) => x.reasons.includes(reason));
  const pri = (x) => (x.escalated ? 0 : x.priority === 'high' ? 1 : 2);
  if (sort === 'oldest') items.sort((a, b) => new Date(a.oldest) - new Date(b.oldest));
  else if (sort === 'flags') items.sort((a, b) => b.flags - a.flags);
  else items.sort((a, b) => pri(a) - pri(b) || new Date(a.oldest) - new Date(b.oldest));
  res.json(items);
});

r.get('/mod/item/:type/:id', async (req, res) => {
  const { type, id } = req.params;
  if (!ACTIONS[type]) return res.status(400).json({ error: 'Unknown type' });
  const t = await loadTarget(db, type, id);
  if (!t) return res.status(404).json({ error: 'Not found' });
  const author = t.author_id ? await one('SELECT id, pseudonym, role, created_at, warnings FROM users WHERE id=$1', [t.author_id]) : null;
  const flagType = type === 'status' ? null : type;
  const reasons = flagType
    ? await q(`SELECT reason, count(*) AS n FROM flags WHERE target_type=$1 AND target_id=$2 AND state='open' GROUP BY reason ORDER BY n DESC`, [flagType, id])
    : [];
  const history = author ? await one(`SELECT
      (SELECT count(*) FROM moderation_actions a JOIN comments k ON a.target_type='comment' AND k.id=a.target_id
         WHERE k.user_id=$1 AND a.action='remove') +
      (SELECT count(*) FROM reports WHERE author_id=$1 AND hidden) AS prior_removals,
      (SELECT count(*) FROM comments WHERE user_id=$1 AND created_at > now() - interval '3 days') AS comments_3d`, [author.id]) : null;
  const escalation = await one(`SELECT * FROM escalations WHERE target_type=$1 AND target_id=$2 AND state='open'`, [type, id]);
  res.json({
    type, id: Number(id), target: t,
    author: author && {
      pseudonym: author.pseudonym, role: author.role, warnings: author.warnings,
      account_age_days: Math.floor((Date.now() - new Date(author.created_at)) / 864e5),
    },
    reasons: reasons.map((x) => ({ ...x, label: FLAG_REASONS[x.reason] || x.reason })),
    history: history && { ...history, rate_limit: history.comments_3d > 30 ? 'reached' : 'not reached' },
    escalated: !!escalation,
    actions: ACTIONS[type],
    report_ref: refOf(t.report_id),
  });
});

r.post('/mod/decide', async (req, res) => {
  const { target_type: type, target_id: id, action, reason_code, note, redacted_body, duplicate_of } = req.body || {};
  if (!ACTIONS[type]?.includes(action)) return res.status(400).json({ error: 'Choose a valid action.' });
  if (!REASON_CODES[reason_code]) return res.status(400).json({ error: 'A reason code is required.' });
  if (reason_code === 'other' && !(note || '').trim()) return res.status(400).json({ error: 'Explain the "Other" reason in the note.' });
  if (action === 'redact' && !(redacted_body || '').trim()) return res.status(400).json({ error: 'Provide the redacted text.' });

  const result = await tx(async (t) => {
    const before = await loadTarget(t, type, id);
    if (!before) return { status: 404, body: { error: 'Not found' } };
    const esc = await t.one(`SELECT * FROM escalations WHERE target_type=$1 AND target_id=$2 AND state='open'`, [type, id]);
    if (esc && action !== 'escalate' && req.user.role !== 'admin')
      return { status: 403, body: { error: 'This item was escalated and needs a senior reviewer.' } };
    if (esc && action === 'escalate') return { status: 409, body: { error: 'Already escalated.' } };

    const label = REASON_CODES[reason_code];
    switch (`${type}:${action}`) {
      case 'comment:redact': await t.q(`UPDATE comments SET body=$2, state='redacted' WHERE id=$1`, [id, redacted_body.trim()]); break;
      case 'comment:remove': await t.q(`UPDATE comments SET state='removed', removed_rule=$2 WHERE id=$1`, [id, label]); break;
      case 'photo:remove': await t.q(`UPDATE report_photos SET hidden=true WHERE id=$1`, [id]); break;
      case 'report:redact': await t.q(`UPDATE reports SET description=$2 WHERE id=$1`, [id, redacted_body.trim()]); break;
      case 'report:remove': await t.q(`UPDATE reports SET hidden=true WHERE id=$1`, [id]); break;
      case 'report:duplicate': {
        const target = await t.one('SELECT id FROM reports WHERE id=$1 AND id<>$2', [Number(duplicate_of), id]);
        if (!target) return { status: 400, body: { error: 'Give the report number it duplicates.' } };
        await t.q(`UPDATE reports SET duplicate_of=$2, status='duplicate', status_changed_at=now() WHERE id=$1`, [id, target.id]);
        await t.q(`INSERT INTO status_events (report_id, status, source, recorded_by, recorder_kind, note) VALUES ($1,'duplicate','user_reported',$2,'moderator',$3)`,
          [id, req.user.id, `Merged into ${refOf(target.id)}`]);
        break;
      }
      case 'status:approve':
        await t.q(`UPDATE status_events SET state='approved' WHERE id=$1`, [id]);
        await t.q(`UPDATE reports SET status=$2, status_source='user_reported', status_changed_at=now() WHERE id=$1`, [before.report_id, before.status]);
        break;
      case 'status:reject': await t.q(`UPDATE status_events SET state='rejected' WHERE id=$1`, [id]); break;
      default: break; // keep / warn / escalate change no content
    }
    if (action === 'warn' && before.author_id) await t.q('UPDATE users SET warnings = warnings + 1 WHERE id=$1', [before.author_id]);

    const after = await loadTarget(t, type, id);
    const act = await t.one(
      `INSERT INTO moderation_actions (moderator_id, target_type, target_id, action, reason_code, note, before, after)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [req.user.id, type, id, action, reason_code, note || null, JSON.stringify(before), JSON.stringify(after)]);

    if (action === 'escalate') {
      await t.q(`INSERT INTO escalations (target_type, target_id, action_id) VALUES ($1,$2,$3)`, [type, id, act.id]);
    } else {
      if (esc) await t.q(`UPDATE escalations SET state='closed' WHERE id=$1`, [esc.id]);
      if (type !== 'status') await t.q(`UPDATE flags SET state='resolved' WHERE target_type=$1 AND target_id=$2 AND state='open'`, [type, id]);
    }
    return { status: 200, body: { message: 'Decision saved to the audit log.', action: act } };
  });
  res.status(result.status).json(result.body);
});

// ---------- appeals ----------
r.get('/mod/appeals', async (_req, res) => {
  res.json(await q(
    `SELECT a.*, u.pseudonym AS appellant, m.action, m.reason_code, m.target_type, m.target_id, m.before, m.note AS decision_note_original,
            m.moderator_id, mu.pseudonym AS original_moderator, du.pseudonym AS decided_by_name
       FROM appeals a JOIN moderation_actions m ON m.id=a.action_id
       JOIN users u ON u.id=a.user_id JOIN users mu ON mu.id=m.moderator_id
       LEFT JOIN users du ON du.id=a.decided_by
      ORDER BY (a.state='open') DESC, a.created_at DESC LIMIT 100`));
});

r.post('/mod/appeals/:id/decide', async (req, res) => {
  const { outcome, note } = req.body || {};
  if (!['upheld', 'overturned'].includes(outcome)) return res.status(400).json({ error: 'Choose uphold or overturn.' });
  if (!(note || '').trim()) return res.status(400).json({ error: 'Explain the appeal decision.' });
  const result = await tx(async (t) => {
    const ap = await t.one(`SELECT a.*, m.moderator_id, m.target_type, m.target_id, m.before, m.action
                              FROM appeals a JOIN moderation_actions m ON m.id=a.action_id WHERE a.id=$1`, [req.params.id]);
    if (!ap) return { status: 404, body: { error: 'Appeal not found' } };
    if (ap.state !== 'open') return { status: 409, body: { error: 'Appeal already decided.' } };
    if (ap.moderator_id === req.user.id) return { status: 403, body: { error: 'Appeals must be handled by a reviewer other than the original decision-maker.' } };
    const before = await loadTarget(t, ap.target_type, ap.target_id);
    if (outcome === 'overturned') {
      if (ap.target_type === 'comment') await t.q(`UPDATE comments SET state='visible', removed_rule=NULL, body=$2 WHERE id=$1`, [ap.target_id, ap.before.body]);
      if (ap.target_type === 'report') await t.q(`UPDATE reports SET hidden=false, description=$2 WHERE id=$1`, [ap.target_id, ap.before.description]);
      if (ap.target_type === 'photo') await t.q(`UPDATE report_photos SET hidden=false WHERE id=$1`, [ap.target_id]);
    }
    const after = await loadTarget(t, ap.target_type, ap.target_id);
    await t.q(`UPDATE appeals SET state=$2, decided_by=$3, decision_note=$4, decided_at=now() WHERE id=$1`, [ap.id, outcome, req.user.id, note.trim()]);
    await t.q(`INSERT INTO moderation_actions (moderator_id, target_type, target_id, action, reason_code, note, before, after)
               VALUES ($1,$2,$3,$4,'other',$5,$6,$7)`,
      [req.user.id, ap.target_type, ap.target_id, `appeal_${outcome}`, note.trim(), JSON.stringify(before), JSON.stringify(after)]);
    return { status: 200, body: { message: `Appeal ${outcome}.` } };
  });
  res.status(result.status).json(result.body);
});

// ---------- corrections ----------
r.get('/mod/corrections', async (_req, res) => {
  res.json(await q(`SELECT c.*, u.pseudonym AS requested_by FROM corrections c LEFT JOIN users u ON u.id=c.user_id
                    ORDER BY (c.state='open') DESC, c.created_at DESC LIMIT 100`));
});

r.post('/mod/corrections/:id/decide', async (req, res) => {
  const { outcome, note } = req.body || {};
  if (!['resolved', 'declined'].includes(outcome)) return res.status(400).json({ error: 'Choose resolved or declined.' });
  if (!(note || '').trim()) return res.status(400).json({ error: 'A note is required.' });
  const result = await tx(async (t) => {
    const c = await t.one('SELECT * FROM corrections WHERE id=$1', [req.params.id]);
    if (!c) return { status: 404, body: { error: 'Not found' } };
    if (c.state !== 'open') return { status: 409, body: { error: 'Already decided.' } };
    await t.q(`UPDATE corrections SET state=$2, decided_by=$3, note=$4 WHERE id=$1`, [c.id, outcome, req.user.id, note.trim()]);
    await t.q(`INSERT INTO moderation_actions (moderator_id, target_type, target_id, action, reason_code, note, before, after)
               VALUES ($1,'correction',$2,$3,'other',$4,$5,$6)`,
      [req.user.id, c.id, `correction_${outcome}`, note.trim(), JSON.stringify(c), JSON.stringify({ ...c, state: outcome })]);
    return { status: 200, body: { message: `Correction ${outcome}.` } };
  });
  res.status(result.status).json(result.body);
});

// ---------- audit ----------
r.get('/mod/audit', async (_req, res) => {
  res.json(await q(`SELECT a.*, u.pseudonym AS moderator, u.email AS moderator_email
                      FROM moderation_actions a JOIN users u ON u.id=a.moderator_id ORDER BY a.id DESC LIMIT 200`));
});

export default r;
