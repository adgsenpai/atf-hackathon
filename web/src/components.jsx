import { useEffect, useRef, useState, createContext, useContext } from 'react';
import { Link } from 'react-router-dom';
import { api, fmtDate } from './api.js';
import { useAuth } from './auth.jsx';

export const STATUS_COLOR = {
  submitted: 'var(--st-submitted)', acknowledged: 'var(--st-open)', in_progress: 'var(--st-open)',
  resolved: 'var(--st-resolved)', reopened: 'var(--st-reopened)', needs_info: 'var(--st-needs)', duplicate: 'var(--st-submitted)',
};
export const STATUS_HEX = {
  submitted: '#1f7a72', acknowledged: '#1f7a72', in_progress: '#1f7a72',
  resolved: '#2e7d32', reopened: '#c4850f', needs_info: '#7a4ea0', duplicate: '#7a8584',
};
export const STATUS_LABEL = {
  submitted: 'Submitted', acknowledged: 'Acknowledged', in_progress: 'In progress', resolved: 'Resolved',
  reopened: 'Reopened', needs_info: 'Needs clarification', duplicate: 'Duplicate',
};

export const StatusBadge = ({ status, prefix }) => (
  <span className="badge"><span className="dot" style={{ background: STATUS_COLOR[status] }} />{prefix}{STATUS_LABEL[status] || status}</span>
);
export const CategoryBadge = ({ children }) => <span className="badge cat">{children}</span>;
export const ProvenanceBadge = ({ official, responded, long }) =>
  official || responded
    ? <span className="badge official">{official ? 'Municipality confirmed' : 'Municipality responded'}</span>
    : <span className="badge user">{long ? 'Status is user-reported' : 'User-reported status'}</span>;

export function Notice({ children, kind, icon = 'i' }) {
  return <div className={`notice ${kind || ''}`}><span className="notice-icon" aria-hidden>{icon}</span><div>{children}</div></div>;
}

export function ReportCard({ r }) {
  return (
    <Link to={`/reports/${r.id}`} className="report-card">
      <div className="badges">
        <CategoryBadge>{r.category_name}</CategoryBadge>
        <StatusBadge status={r.status} />
        <ProvenanceBadge official={r.status_source === 'official'} responded={r.municipality_responded} />
      </div>
      <h3>{r.title}</h3>
      <div className="small muted">
        {[r.suburb, r.ward, `Observed ${fmtDate(r.observed_on)}`, `${r.followers} follow`, `${r.updates} updates`].filter(Boolean).join(' · ')}
        {r.precision === 'reduced' && ' · approximate location'}
      </div>
    </Link>
  );
}

export function SourceLine({ s, extra }) {
  if (!s) return null;
  return (
    <div className="source">
      Source: {s.source}{s.url ? <> · URL: {s.url}</> : null} · Last checked: {s.last_checked || '—'} · Verification: {s.verification}
      {extra}
    </div>
  );
}

// ---------- toast ----------
const ToastCtx = createContext(() => {});
export function ToastProvider({ children }) {
  const [msg, setMsg] = useState(null);
  const t = useRef();
  const show = (m) => { setMsg(m); clearTimeout(t.current); t.current = setTimeout(() => setMsg(null), 3800); };
  return <ToastCtx.Provider value={show}>{children}{msg && <div className="toast" role="status">{msg}</div>}</ToastCtx.Provider>;
}
export const useToast = () => useContext(ToastCtx);

// ---------- modal ----------
export function Modal({ open, onClose, title, children }) {
  const ref = useRef();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className="modal" onClose={onClose} onCancel={onClose}>
      <div className="inner">
        <div className="row between"><h3 style={{ margin: 0 }}>{title}</h3><button className="linkbtn" onClick={onClose}>Close</button></div>
        <div style={{ marginTop: 14 }}>{open && children}</div>
      </div>
    </dialog>
  );
}

export function useRequireSignIn() {
  const { user } = useAuth();
  const toast = useToast();
  return () => {
    if (user) return true;
    toast('Please sign in first.');
    return false;
  };
}

export function FlagDialog({ open, onClose, target }) {
  const [reasons, setReasons] = useState({});
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  const [err, setErr] = useState('');
  const toast = useToast();
  useEffect(() => { if (open) { api('/flag-reasons').then(setReasons); setReason(''); setDetails(''); setErr(''); } }, [open]);
  const submit = async (e) => {
    e.preventDefault();
    try {
      const r = await api('/flags', { method: 'POST', body: { ...target, reason, details } });
      toast(r.message); onClose();
    } catch (x) { setErr(x.message); }
  };
  return (
    <Modal open={open} onClose={onClose} title="Flag for moderators">
      <form onSubmit={submit} className="stack">
        <div>
          <label className="field" htmlFor="flag-reason">Which community rule does it break?</label>
          <select id="flag-reason" className="input" value={reason} onChange={(e) => setReason(e.target.value)} required>
            <option value="">Choose a reason</option>
            {Object.entries(reasons).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div>
          <label className="field" htmlFor="flag-details">Details (optional)</label>
          <textarea id="flag-details" className="input" value={details} onChange={(e) => setDetails(e.target.value)} style={{ minHeight: 70 }} />
        </div>
        {err && <div className="error">{err}</div>}
        <button className="btn btn-primary" type="submit">Send flag</button>
      </form>
    </Modal>
  );
}

export function TextDialog({ open, onClose, title, label, help, submitLabel, onSubmit }) {
  const [text, setText] = useState('');
  const [err, setErr] = useState('');
  const toast = useToast();
  useEffect(() => { if (open) { setText(''); setErr(''); } }, [open]);
  const submit = async (e) => {
    e.preventDefault();
    try { const r = await onSubmit(text); toast(r?.message || 'Sent.'); onClose(); } catch (x) { setErr(x.message); }
  };
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <form onSubmit={submit} className="stack">
        <div>
          <label className="field" htmlFor="td-text">{label}</label>
          <textarea id="td-text" className="input" value={text} onChange={(e) => setText(e.target.value)} required />
          {help && <div className="help">{help}</div>}
        </div>
        {err && <div className="error">{err}</div>}
        <button className="btn btn-primary" type="submit">{submitLabel}</button>
      </form>
    </Modal>
  );
}
