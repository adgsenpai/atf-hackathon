import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, fmtDate, fmtDateTime } from '../api.js';
import { useAuth } from '../auth.jsx';
import {
  CategoryBadge, FlagDialog, Modal, Notice, ProvenanceBadge, STATUS_LABEL, StatusBadge, TextDialog, useRequireSignIn, useToast,
} from '../components.jsx';
import { PinMap } from '../MapView.jsx';

const NEXT = {
  submitted: ['acknowledged', 'needs_info'], acknowledged: ['in_progress', 'resolved'], in_progress: ['resolved', 'reopened'],
  resolved: ['reopened'], reopened: ['acknowledged', 'in_progress', 'resolved'], needs_info: ['acknowledged'], duplicate: [],
};
const RECORDER = {
  author: 'by report author', community: 'recorded by a community participant',
  official: 'from an official response', moderator: 'recorded by a moderator',
};

export default function ReportDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const toast = useToast();
  const needUser = useRequireSignIn();
  const [r, setR] = useState(null);
  const [err, setErr] = useState('');
  const [comments, setComments] = useState([]);
  const [flagTarget, setFlagTarget] = useState(null);
  const [correction, setCorrection] = useState(false);
  const [appealFor, setAppealFor] = useState(null);
  const [statusOpen, setStatusOpen] = useState(false);

  const load = useCallback(() => {
    api(`/reports/${id}`).then(setR).catch((e) => setErr(e.message));
    api(`/reports/${id}/comments`).then(setComments);
  }, [id]);
  useEffect(load, [load]);

  if (err) return <div className="container page"><h1>Report not found</h1><p><Link to="/">Back to reports</Link></p></div>;
  if (!r) return <div className="container page muted">Loading…</div>;

  const official = r.status_source === 'official';
  const toggleFollow = async () => {
    if (!needUser()) return;
    await api(`/reports/${r.id}/follow`, { method: r.viewer.following ? 'DELETE' : 'POST' });
    load();
  };
  const same = async () => {
    if (!needUser()) return;
    const x = await api(`/reports/${r.id}/same`, { method: 'POST' });
    toast(x.same ? 'Thanks. You are now following this report.' : 'Removed your “same problem”.');
    load();
  };
  const flag = (target) => needUser() && setFlagTarget(target);

  return (
    <div className="container page">
      <div className="crumbs">
        <Link to="/reports">Reports</Link> / {r.municipality_slug ? <Link to={`/municipalities/${r.municipality_slug}`}>{r.municipality}</Link> : 'Outside pilot area'}
        {r.ward && <> / <Link to={`/reports?ward=${r.ward_id}`}>{r.ward}</Link></>} / <Link to={`/reports?category=${r.category}`}>{r.category_name}</Link>
      </div>
      <div className="badges">
        <CategoryBadge>{r.category_name}</CategoryBadge>
        <StatusBadge status={r.status} prefix="Status: " />
        <ProvenanceBadge official={official} long />
        {r.is_sample && <span className="badge warn">Demo report</span>}
      </div>
      <h1 style={{ marginTop: 10 }}>{r.title}</h1>
      <p className="small muted">
        Report {r.ref}{r.is_sample ? ' (demo)' : ''} · Submitted by a resident on {fmtDate(r.created_at)} · Observed {fmtDate(r.observed_on)}
        {r.municipality && <> · {r.municipality}</>}{r.ward && <>, {r.ward}</>}
      </p>

      <div style={{ margin: '16px 0 20px' }}>
        <Notice>
          {official
            ? <><strong>Current status confirmed by an official response.</strong> Earlier entries may be user-reported; each one is labelled below. </>
            : <><strong>User-submitted report. Not yet confirmed by the municipality.</strong> </>}
          {r.sent_to_municipality
            ? 'This report was sent through an official integration.'
            : 'This report was not sent through an official integration.'}
          {!official && !r.municipality_responded && ' The municipality has not confirmed receipt on this platform.'}
        </Notice>
      </div>

      <div className="two-col">
        <div className="stack">
          <section className="card">
            <h2>Description</h2>
            <p style={{ whiteSpace: 'pre-wrap' }}>{r.description}</p>
            <h3 style={{ marginTop: 18 }}>Evidence ({r.photos.length} photo{r.photos.length === 1 ? '' : 's'})</h3>
            {r.photos.length ? (
              <div className="photos">
                {r.photos.map((p) => (
                  <figure key={p.id} style={{ margin: 0 }}>
                    <div className="photo">{p.path ? <a href={p.path} target="_blank" rel="noreferrer"><img src={p.path} alt={`${p.kind} photo`} /></a> : 'Photo placeholder'}</div>
                    <figcaption className="xs muted" style={{ marginTop: 4 }}>
                      {fmtDate(p.created_at)} · {p.kind === 'author' ? 'author' : 'community update'} · <button className="linkbtn" onClick={() => flag({ target_type: 'photo', target_id: p.id })}>Flag</button>
                    </figcaption>
                  </figure>
                ))}
              </div>
            ) : <p className="small muted">No photos yet.</p>}
            <p className="xs muted" style={{ marginTop: 8 }}>Location data is removed from uploaded photos.</p>
            <PhotoUpdate reportId={r.id} onDone={load} needUser={needUser} />
          </section>

          <section className="card">
            <h2>Status history</h2>
            <p className="small muted">Each change shows who recorded it and how it was verified.</p>
            <ol className="timeline">
              {r.events.map((e) => (
                <li key={e.id}>
                  <span className="node" />
                  <strong>{e.status_label}</strong>
                  <div className="small muted">
                    {fmtDateTime(e.created_at)} · {RECORDER[e.recorder_kind]} ·{' '}
                    {e.source === 'official' ? <span className="badge official">municipality confirmed</span> : <span className="badge user">user-reported</span>}
                  </div>
                  {(e.note || e.evidence) && (
                    <div className="quote">
                      {e.note && <>“{e.note}”</>} {e.evidence && <span className="muted">Evidence: {e.evidence}</span>}
                    </div>
                  )}
                  {e.reference && <div className="xs muted" style={{ marginTop: 4 }}>Source: official response, reference [{e.reference}].</div>}
                </li>
              ))}
              {NEXT[r.status]?.length > 0 && (
                <li>
                  <span className="node future" />
                  <strong className="muted">Next: {NEXT[r.status].map((s) => STATUS_LABEL[s]).join(' or ')}</strong>
                  <div className="small muted">Anyone can propose a status change with evidence. Moderators review it before it is shown.</div>
                </li>
              )}
            </ol>
            {r.my_pending.length > 0 && (
              <p className="small"><span className="badge warn">Awaiting review</span> Your proposal: {r.my_pending.map((p) => STATUS_LABEL[p.status]).join(', ')}</p>
            )}
            {r.status !== 'duplicate' && (
              <button className="btn btn-sm" onClick={() => needUser() && setStatusOpen(true)}>
                {r.viewer.can_set_official_status ? 'Record official status' : 'Propose a status change'}
              </button>
            )}
          </section>

          <Discussion r={r} comments={comments} reload={load} flag={flag} onAppeal={setAppealFor} />
        </div>

        <aside className="stack">
          <div className="card">
            <button className={`btn btn-block ${r.viewer.following ? 'on' : 'btn-primary'}`} onClick={toggleFollow}>
              {r.viewer.following ? 'Following ✓' : 'Follow this report'}
            </button>
            <p className="small muted" style={{ margin: '8px 0 12px' }}>{r.followers} {r.followers === 1 ? 'person follows' : 'people follow'}. You will be notified of status changes and replies.</p>
            <div className="row" style={{ gap: 8 }}>
              <button className={`btn btn-sm grow ${r.viewer.same ? 'on' : ''}`} onClick={same}>Same problem{r.same ? ` · ${r.same}` : ''}</button>
              <button className="btn btn-sm grow" onClick={() => flag({ target_type: 'report', target_id: r.id })}>Flag report</button>
            </div>
          </div>

          <div className="card tight">
            <PinMap lat={r.lat} lng={r.lng} status={r.status} reduced={r.precision === 'reduced' && !r.is_author} />
            <p style={{ margin: '10px 0 0' }}><strong>{r.street || r.suburb || 'Location'}{r.street && r.suburb ? `, ${r.suburb}` : ''}</strong></p>
            <p className="xs muted" style={{ margin: 0 }}>Pin precision: {r.precision}. {r.ward || 'Ward not found'}{r.municipality ? ` · ${r.municipality}` : ''}</p>
          </div>

          <div className="card">
            <h3>Who is responsible?</h3>
            {r.responsibility ? (
              <>
                <p className="small">{r.responsibility.service}: usually <strong>{r.responsibility.responsible}</strong>.</p>
                <p className="small">Official channel: {r.responsibility.channel}</p>
                <p className="xs muted">Source: {r.responsibility.source} · last checked {r.responsibility.last_checked} · <span className="badge official">{r.responsibility.verification}</span></p>
              </>
            ) : <p className="small muted">No responsibility record for this category yet.</p>}
          </div>

          <div className="card">
            <h3>About this report</h3>
            <dl className="kv">
              <dt>Author</dt><dd>Resident (name hidden)</dd>
              <dt>Duplicates</dt><dd>{r.duplicates} merged</dd>
              <dt>Reopened</dt><dd>{r.reopened} times</dd>
              <dt>Sent to municipality</dt><dd>{r.sent_to_municipality ? 'Yes, via integration' : 'No integration used'}</dd>
            </dl>
            <p style={{ marginTop: 12, marginBottom: 0 }}><button className="linkbtn small" onClick={() => needUser() && setCorrection(true)}>Request a correction</button></p>
          </div>
        </aside>
      </div>

      <FlagDialog open={!!flagTarget} target={flagTarget} onClose={() => setFlagTarget(null)} />
      <TextDialog open={correction} onClose={() => setCorrection(false)} title="Request a correction" label="What is wrong, and what should it say?"
        help="Moderators review every correction request." submitLabel="Send request"
        onSubmit={(details) => api('/corrections', { method: 'POST', body: { target_type: 'report', target_id: r.id, details } })} />
      <TextDialog open={!!appealFor} onClose={() => setAppealFor(null)} title="Appeal a moderation decision" label="Why should this decision change?"
        help="A reviewer other than the original decision-maker will handle your appeal." submitLabel="Submit appeal"
        onSubmit={(reason) => api('/appeals', { method: 'POST', body: { action_id: appealFor, reason } })} />
      <StatusDialog open={statusOpen} onClose={() => setStatusOpen(false)} r={r} onDone={load} />
    </div>
  );
}

function PhotoUpdate({ reportId, onDone, needUser }) {
  const ref = useRef();
  const toast = useToast();
  const upload = async (files) => {
    if (!files?.length) return;
    const fd = new FormData();
    Array.from(files).slice(0, 4).forEach((f) => fd.append('photos', f));
    try { await api(`/reports/${reportId}/photos`, { method: 'POST', body: fd }); toast('Photo update added.'); onDone(); } catch (e) { toast(e.message); }
    ref.current.value = '';
  };
  return (
    <>
      <input ref={ref} type="file" accept="image/jpeg,image/png" multiple hidden onChange={(e) => upload(e.target.files)} />
      <button className="btn btn-sm" style={{ marginTop: 6 }} onClick={() => needUser() && ref.current.click()}>Add photo update</button>
    </>
  );
}

function StatusDialog({ open, onClose, r, onDone }) {
  const [status, setStatus] = useState('');
  const [note, setNote] = useState('');
  const [evidence, setEvidence] = useState('');
  const [reference, setReference] = useState('');
  const [err, setErr] = useState('');
  const toast = useToast();
  const isOfficial = r.viewer.can_set_official_status;
  useEffect(() => { if (open) { setStatus(NEXT[r.status]?.[0] || ''); setNote(''); setEvidence(''); setReference(''); setErr(''); } }, [open, r.status]);
  const submit = async (e) => {
    e.preventDefault();
    try {
      const x = await api(`/reports/${r.id}/status`, { method: 'POST', body: { status, note, evidence, reference } });
      toast(x.message); onClose(); onDone();
    } catch (x) { setErr(x.message); }
  };
  return (
    <Modal open={open} onClose={onClose} title={isOfficial ? 'Record official status' : 'Propose a status change'}>
      <form onSubmit={submit} className="stack">
        <p className="small muted">{isOfficial
          ? 'As a verified municipality representative, this change is shown immediately and labelled “municipality confirmed”.'
          : 'Your proposal is shown after a moderator checks it. It will be labelled “user-reported”.'}</p>
        <div>
          <label className="field" htmlFor="st">New status</label>
          <select id="st" className="input" value={status} onChange={(e) => setStatus(e.target.value)} required>
            {['acknowledged', 'in_progress', 'resolved', 'reopened', 'needs_info'].map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
        </div>
        <div>
          <label className="field" htmlFor="st-note">What happened?</label>
          <textarea id="st-note" className="input" style={{ minHeight: 70 }} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Received an automated reply with a reference number." />
        </div>
        <div>
          <label className="field" htmlFor="st-ev">Evidence</label>
          <input id="st-ev" className="input" value={evidence} onChange={(e) => setEvidence(e.target.value)} placeholder="e.g. Screenshot of SMS, photo update" />
        </div>
        {isOfficial && (
          <div>
            <label className="field" htmlFor="st-ref">Official reference</label>
            <input id="st-ref" className="input" value={reference} onChange={(e) => setReference(e.target.value)} />
          </div>
        )}
        {err && <div className="error">{err}</div>}
        <button className="btn btn-primary" type="submit">{isOfficial ? 'Save status' : 'Send for review'}</button>
      </form>
    </Modal>
  );
}

function Discussion({ r, comments, reload, flag, onAppeal }) {
  const { user } = useAuth();
  const needUser = useRequireSignIn();
  const [body, setBody] = useState('');
  const [replyTo, setReplyTo] = useState(null);
  const [replyBody, setReplyBody] = useState('');
  const [err, setErr] = useState('');

  const byId = Object.fromEntries(comments.map((c) => [c.id, c]));
  const rootOf = (c) => { let x = c; while (x.parent_id && byId[x.parent_id]) x = byId[x.parent_id]; return x.id; };
  const roots = comments.filter((c) => !c.parent_id);
  const replies = (id) => comments.filter((c) => c.parent_id && rootOf(c) === id);

  const post = async (text, parent_id) => {
    setErr('');
    try {
      await api(`/reports/${r.id}/comments`, { method: 'POST', body: { body: text, parent_id } });
      setBody(''); setReplyBody(''); setReplyTo(null); reload();
    } catch (e) { setErr(e.message); }
  };
  const helpful = async (c) => { if (!needUser()) return; await api(`/comments/${c.id}/helpful`, { method: 'POST' }); reload(); };

  const renderComment = (c, reply) => {
    if (c.state === 'removed' && !c.body) {
      return (
        <div className={`comment removed ${reply ? 'reply' : ''}`}>
          <strong>Comment removed by moderators.</strong> It broke the rule on {String(c.removed_rule || 'community rules').toLowerCase()}.{' '}
          {c.appeal_action_id && <button className="linkbtn" onClick={() => onAppeal(c.appeal_action_id)}>Appeal</button>}
        </div>
      );
    }
    return (
      <div className={`comment ${reply ? 'reply' : ''} ${c.is_official ? 'official' : ''}`}>
        <div className="row between">
          <div className="row" style={{ gap: 8 }}>
            <strong>{c.author}</strong>
            {c.is_official && c.verified && <span className="badge verified">Verified account</span>}
            {c.state === 'redacted' && <span className="badge warn">Edited by moderators</span>}
            {c.state === 'removed' && <span className="badge high">Removed (visible to moderators)</span>}
          </div>
          <span className="xs muted">{fmtDate(c.created_at)}</span>
        </div>
        <p style={{ margin: '6px 0 8px', whiteSpace: 'pre-wrap' }}>{c.body}</p>
        <div className="row" style={{ gap: 8 }}>
          <button className={`btn btn-sm ${c.voted ? 'on' : ''}`} onClick={() => helpful(c)}>Helpful · {c.helpful}</button>
          <button className="btn btn-sm" onClick={() => needUser() && setReplyTo(c.id)}>Reply</button>
          {!c.mine && <button className="btn btn-sm" onClick={() => flag({ target_type: 'comment', target_id: c.id })}>Flag</button>}
          {c.appeal_action_id && <button className="linkbtn small" onClick={() => onAppeal(c.appeal_action_id)}>Appeal edit</button>}
        </div>
        {replyTo === c.id && (
          <form className="stack" style={{ marginTop: 10 }} onSubmit={(e) => { e.preventDefault(); post(replyBody, c.id); }}>
            <textarea className="input" style={{ minHeight: 70 }} value={replyBody} onChange={(e) => setReplyBody(e.target.value)} placeholder="Write a reply" autoFocus />
            <div className="row"><button className="btn btn-primary btn-sm" type="submit">Post reply</button><button type="button" className="btn btn-sm" onClick={() => setReplyTo(null)}>Cancel</button></div>
          </form>
        )}
      </div>
    );
  };

  return (
    <section className="card">
      <div className="row between"><h2 style={{ margin: 0 }}>Discussion ({comments.length})</h2><Link to="/rules" className="small">Community rules</Link></div>
      <div style={{ marginTop: 8 }}>
        {roots.map((c) => (
          <div key={c.id}>
            {renderComment(c)}
            {replies(c.id).map((x) => <div key={x.id}>{renderComment(x, true)}</div>)}
          </div>
        ))}
        {!comments.length && <p className="muted small">No comments yet.</p>}
      </div>
      <form className="stack" style={{ marginTop: 16 }} onSubmit={(e) => { e.preventDefault(); if (needUser()) post(body); }}>
        <label className="field" htmlFor="new-comment">Add an update or comment</label>
        <textarea id="new-comment" className="input" value={body} onChange={(e) => setBody(e.target.value)}
          placeholder={user ? 'Share what you have seen. Stick to facts. No personal details.' : 'Sign in to comment.'} />
        {err && <div className="error">{err}</div>}
        <div><button className="btn btn-primary" type="submit">Post comment</button></div>
      </form>
    </section>
  );
}
