import { Fragment, useCallback, useEffect, useState } from 'react';
import { Link, NavLink, Route, Routes } from 'react-router-dom';
import { ago, api, fmtDateTime, qs } from '../api.js';
import { useAuth } from '../auth.jsx';
import { STATUS_LABEL, useToast } from '../components.jsx';

const TYPE_LABEL = { comment: 'Comment', photo: 'Photo', report: 'Report', status: 'Status change' };
const ACTION_LABEL = {
  keep: 'Keep', redact: 'Edit to redact', remove: 'Remove', warn: 'Warn author', escalate: 'Escalate to senior',
  duplicate: 'Merge as duplicate', approve: 'Approve status', reject: 'Reject status',
};

export default function Moderation() {
  const { user, isMod } = useAuth();
  if (!user) return <div className="container page"><h1>Moderation</h1><p><Link to="/signin?next=/moderation">Sign in</Link> with a moderator account.</p></div>;
  if (!isMod) return <div className="container page"><h1>Moderation</h1><p>Your account does not have moderator access.</p></div>;
  return (
    <div className="container page">
      <div className="row between">
        <h1 style={{ margin: 0 }}>Moderation</h1>
        <nav className="tabs" style={{ margin: 0, border: 0 }}>
          <NavLink end to="/moderation">Queue</NavLink>
          <NavLink to="/moderation/appeals">Appeals</NavLink>
          <NavLink to="/moderation/corrections">Corrections</NavLink>
          <NavLink to="/moderation/audit">Audit log</NavLink>
        </nav>
      </div>
      <Routes>
        <Route index element={<Queue />} />
        <Route path="appeals" element={<Appeals />} />
        <Route path="corrections" element={<Corrections />} />
        <Route path="audit" element={<Audit />} />
      </Routes>
    </div>
  );
}

function Queue() {
  const [stats, setStats] = useState(null);
  const [meta, setMeta] = useState(null);
  const [items, setItems] = useState([]);
  const [f, setF] = useState({ type: 'all', reason: 'all', sort: 'priority' });
  const [sel, setSel] = useState(null);

  const load = useCallback(() => {
    api('/mod/stats').then(setStats);
    api(`/mod/queue${qs(f)}`).then((x) => { setItems(x); setSel((s) => (s && x.find((i) => i.key === s) ? s : x[0]?.key || null)); });
  }, [f]);
  useEffect(() => { api('/mod/meta').then(setMeta); }, []);
  useEffect(load, [load]);

  return (
    <>
      <p className="muted small">Every action needs a reason code and is written to the audit log.</p>
      {stats && (
        <div className="kpis four" style={{ margin: '12px 0 20px' }}>
          <div className="kpi card tight"><div className="label">Open flags</div><div className="value">{stats.open_flags}</div><div className="xs muted">+ {stats.pending_status} status proposals</div></div>
          <div className="kpi card tight"><div className="label">Needs a second reviewer</div><div className="value">{stats.needs_second}</div></div>
          <div className="kpi card tight"><div className="label">Open appeals</div><div className="value">{stats.open_appeals}</div></div>
          <div className="kpi card tight"><div className="label">Oldest unreviewed</div><div className="value">{stats.oldest_hours} h</div></div>
        </div>
      )}
      <div className="mod-shell">
        <div>
          <div className="row" style={{ gap: 8, marginBottom: 10 }}>
            <select className="input" style={{ flex: 1 }} aria-label="Type" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
              <option value="all">All types</option>{Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <select className="input" style={{ flex: 1 }} aria-label="Reason" value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })}>
              <option value="all">All reasons</option>{meta && Object.entries(meta.flag_reasons).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <select className="input" style={{ flex: 1 }} aria-label="Sort" value={f.sort} onChange={(e) => setF({ ...f, sort: e.target.value })}>
              <option value="priority">Priority</option><option value="oldest">Oldest</option><option value="flags">Most flags</option>
            </select>
          </div>
          <div className="q-list">
            {items.map((x) => (
              <button key={x.key} className={`q-item ${sel === x.key ? 'active' : ''}`} onClick={() => setSel(x.key)}>
                <div className="badges">
                  {x.escalated && <span className="badge warn">Escalated</span>}
                  <span className={`badge ${x.priority === 'high' ? 'high' : ''}`}>{x.priority === 'high' ? 'High priority' : 'Normal'}</span>
                  <span className="badge">{TYPE_LABEL[x.type]}</span>
                </div>
                <div style={{ fontWeight: 600, margin: '6px 0 2px' }}>{x.summary}</div>
                <div className="xs muted">{x.type === 'status' ? 'Proposal' : `${x.flags} flag${x.flags === 1 ? '' : 's'}`} · Report {x.report_ref} · {ago(x.oldest)}</div>
              </button>
            ))}
            {!items.length && <div className="card empty">The queue is empty.</div>}
          </div>
        </div>
        <div>{sel ? <ItemPanel key={sel} itemKey={sel} meta={meta} onDone={load} /> : <div className="card empty">Select an item.</div>}</div>
      </div>
    </>
  );
}

function ItemPanel({ itemKey, meta, onDone }) {
  const [type, id] = itemKey.split(':');
  const { user } = useAuth();
  const toast = useToast();
  const [d, setD] = useState(null);
  const [action, setAction] = useState('');
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [redacted, setRedacted] = useState('');
  const [dupOf, setDupOf] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    api(`/mod/item/${type}/${id}`).then((x) => { setD(x); setRedacted(x.target.body || x.target.description || ''); });
  }, [type, id]);
  if (!d || !meta) return <div className="card muted">Loading…</div>;
  const t = d.target;

  const save = async () => {
    setErr('');
    try {
      const x = await api('/mod/decide', { method: 'POST', body: { target_type: type, target_id: Number(id), action, reason_code: reason, note, redacted_body: redacted, duplicate_of: dupOf } });
      toast(x.message); onDone();
    } catch (e) { setErr(e.message); }
  };

  return (
    <div className="card stack">
      <div className="row between">
        <div className="badges">
          {d.escalated && <span className="badge warn">Escalated · needs senior reviewer</span>}
          {d.reasons.map((r) => <span key={r.reason} className="badge">Rule: {r.label.toLowerCase()}</span>)}
        </div>
        <Link className="small" to={`/reports/${t.report_id}`} target="_blank">Open report {d.report_ref}</Link>
      </div>
      <div>
        <div className="small muted">{TYPE_LABEL[type]} on {d.report_ref} · {t.report_title}</div>
        {d.author && <div className="small muted">Posted by {d.author.pseudonym} (account age {d.author.account_age_days} days) · {fmtDateTime(t.created_at)}</div>}
        <div className="quote" style={{ background: '#f7f5ef', borderLeft: '3px solid var(--line-strong)', padding: '10px 12px', marginTop: 8 }}>
          {type === 'comment' && t.body}
          {type === 'report' && <><strong>{t.title}</strong><br />{t.description}</>}
          {type === 'photo' && (t.path ? <img src={t.path} alt="Flagged" style={{ maxHeight: 220 }} /> : 'Demo photo (no image file stored)')}
          {type === 'status' && <>Proposed <strong>{STATUS_LABEL[t.status]}</strong> (current: {STATUS_LABEL[t.current_status]}).<br />Note: {t.note || '—'}<br />Evidence: {t.evidence || 'none provided'}</>}
        </div>
      </div>
      <div className="row" style={{ alignItems: 'flex-start', gap: 24 }}>
        <div className="grow">
          <h3>Flag reasons</h3>
          {d.reasons.length ? <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>{d.reasons.map((r) => <li key={r.reason}>{r.label} ({r.n})</li>)}</ul> : <p className="small muted">Status proposal awaiting review.</p>}
        </div>
        {d.history && (
          <div className="grow">
            <h3>Author history</h3>
            <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
              <li>{d.history.prior_removals} prior removals</li>
              <li>{d.history.comments_3d} comments in 3 days</li>
              <li>{d.author.warnings} warnings</li>
              <li>Rate limit: {d.history.rate_limit}</li>
            </ul>
          </div>
        )}
      </div>

      <div>
        <h3>Decision</h3>
        <div className="actions-grid">
          {d.actions.map((a) => (
            <button key={a} className={`btn btn-sm ${action === a ? 'on' : ''} ${a === 'remove' ? 'btn-danger' : ''}`} onClick={() => setAction(a)}
              disabled={d.escalated && a === 'escalate'}>{ACTION_LABEL[a]}</button>
          ))}
        </div>
      </div>
      {action === 'redact' && (
        <div><label className="field" htmlFor="red">Redacted text</label><textarea id="red" className="input" value={redacted} onChange={(e) => setRedacted(e.target.value)} /></div>
      )}
      {action === 'duplicate' && (
        <div><label className="field" htmlFor="dup">Duplicate of report number</label><input id="dup" className="input" placeholder="e.g. 5" value={dupOf} onChange={(e) => setDupOf(e.target.value.replace(/\D/g, ''))} /></div>
      )}
      <div>
        <label className="field" htmlFor="rc">Reason code (required)</label>
        <select id="rc" className="input" value={reason} onChange={(e) => setReason(e.target.value)}>
          <option value="">Choose a reason code</option>
          {Object.entries(meta.reason_codes).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      <div>
        <label className="field" htmlFor="note">Note shown to the author</label>
        <textarea id="note" className="input" style={{ minHeight: 70 }} value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      <p className="xs muted">The author sees the rule and can appeal. Reviewers other than the original decision-maker handle appeals. This action will be saved to the audit log with your name ({user.pseudonym}), the time and the content before and after.</p>
      {err && <div className="error">{err}</div>}
      <div className="row"><button className="btn btn-primary" onClick={save} disabled={!action || !reason}>Save decision</button><button className="btn" onClick={() => { setAction(''); setReason(''); setNote(''); }}>Cancel</button></div>
    </div>
  );
}

function DecideRow({ onDecide, options }) {
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const go = async (o) => { setErr(''); try { await onDecide(o, note); } catch (e) { setErr(e.message); } };
  return (
    <div className="stack" style={{ marginTop: 10 }}>
      <textarea className="input" style={{ minHeight: 60 }} placeholder="Decision note (required)" value={note} onChange={(e) => setNote(e.target.value)} />
      <div className="row">{options.map(([k, label]) => <button key={k} className="btn btn-sm" onClick={() => go(k)}>{label}</button>)}</div>
      {err && <div className="error">{err}</div>}
    </div>
  );
}

function Appeals() {
  const [list, setList] = useState([]);
  const { user } = useAuth();
  const toast = useToast();
  const load = () => api('/mod/appeals').then(setList);
  useEffect(() => { load(); }, []);
  return (
    <div className="stack" style={{ marginTop: 16 }}>
      {list.map((a) => (
        <div key={a.id} className="card">
          <div className="row between">
            <div className="badges"><span className={`badge ${a.state === 'open' ? 'warn' : ''}`}>{a.state}</span><span className="badge">{a.target_type} #{a.target_id}</span><span className="badge">Original: {a.action} · {a.reason_code}</span></div>
            <span className="xs muted">{fmtDateTime(a.created_at)}</span>
          </div>
          <p className="small" style={{ marginTop: 8 }}><strong>{a.appellant}</strong>: “{a.reason}”</p>
          <p className="small muted">Original content: {a.before?.body || a.before?.description || a.before?.title || '—'}</p>
          <p className="xs muted">Original decision by {a.original_moderator}{a.decided_by_name && ` · Appeal decided by ${a.decided_by_name}: ${a.decision_note}`}</p>
          {a.state === 'open' && (a.moderator_id === user.id
            ? <p className="small muted">You made the original decision, so another reviewer must handle this appeal.</p>
            : <DecideRow options={[['upheld', 'Uphold decision'], ['overturned', 'Overturn and restore']]}
                onDecide={async (outcome, note) => { const x = await api(`/mod/appeals/${a.id}/decide`, { method: 'POST', body: { outcome, note } }); toast(x.message); load(); }} />)}
        </div>
      ))}
      {!list.length && <div className="card empty">No appeals.</div>}
    </div>
  );
}

function Corrections() {
  const [list, setList] = useState([]);
  const toast = useToast();
  const load = () => api('/mod/corrections').then(setList);
  useEffect(() => { load(); }, []);
  return (
    <div className="stack" style={{ marginTop: 16 }}>
      {list.map((c) => (
        <div key={c.id} className="card">
          <div className="row between">
            <div className="badges"><span className={`badge ${c.state === 'open' ? 'warn' : ''}`}>{c.state}</span><span className="badge">{c.target_type} #{c.target_id}</span></div>
            <span className="xs muted">{fmtDateTime(c.created_at)} · {c.requested_by || 'anonymous'}</span>
          </div>
          <p style={{ marginTop: 8 }}>{c.details}</p>
          {c.note && <p className="small muted">Moderator note: {c.note}</p>}
          {c.state === 'open' && <DecideRow options={[['resolved', 'Mark corrected'], ['declined', 'Decline']]}
            onDecide={async (outcome, note) => { const x = await api(`/mod/corrections/${c.id}/decide`, { method: 'POST', body: { outcome, note } }); toast(x.message); load(); }} />}
        </div>
      ))}
      {!list.length && <div className="card empty">No correction requests.</div>}
    </div>
  );
}

function Audit() {
  const [list, setList] = useState([]);
  const [open, setOpen] = useState(null);
  useEffect(() => { api('/mod/audit').then(setList); }, []);
  return (
    <div className="card" style={{ marginTop: 16 }}>
      <p className="small muted">Append-only. Entries cannot be edited or deleted.</p>
      <div className="table-wrap">
        <table className="t">
          <thead><tr><th>When</th><th>Moderator</th><th>Target</th><th>Action</th><th>Reason</th><th>Note</th><th /></tr></thead>
          <tbody>
            {list.map((a) => (
              <Fragment key={a.id}>
                <tr>
                  <td className="small">{fmtDateTime(a.created_at)}</td><td>{a.moderator}</td><td>{a.target_type} #{a.target_id}</td>
                  <td><span className="badge">{a.action}</span></td><td>{a.reason_code}</td><td className="small">{a.note}</td>
                  <td><button className="linkbtn small" onClick={() => setOpen(open === a.id ? null : a.id)}>{open === a.id ? 'Hide' : 'Before/after'}</button></td>
                </tr>
                {open === a.id && (
                  <tr><td colSpan={7}>
                    <div className="row" style={{ alignItems: 'flex-start' }}>
                      <pre className="xs grow" style={{ whiteSpace: 'pre-wrap', background: '#f7f5ef', padding: 10, borderRadius: 6 }}>Before: {JSON.stringify(a.before, null, 2)}</pre>
                      <pre className="xs grow" style={{ whiteSpace: 'pre-wrap', background: '#f7f5ef', padding: 10, borderRadius: 6 }}>After: {JSON.stringify(a.after, null, 2)}</pre>
                    </div>
                  </td></tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
