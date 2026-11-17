import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api, fmtDateTime, qs } from '../api.js';
import { Notice } from '../components.jsx';

const LEVELS = ['National', 'Provincial', 'Metro', 'District'];
const PAGE = 24;

export function PartyLogo({ party, size = 56 }) {
  const [broken, setBroken] = useState(false);
  const initials = (party.abbreviation || party.name || '?').replace(/[^A-Z0-9]/gi, '').slice(0, 4).toUpperCase();
  if (!party.logo || broken) {
    return <span className="party-logo placeholder" style={{ width: size, height: size }} aria-hidden>{initials}</span>;
  }
  return <img className="party-logo" src={party.logo} alt="" width={size} height={size} loading="lazy" onError={() => setBroken(true)} />;
}

export function RegistrySource({ source }) {
  if (!source) return null;
  return (
    <p className="source">
      Source: <a href={source.url} target="_blank" rel="noreferrer">{source.source}</a>
      {source.scraped_at && <> · Last scraped {fmtDateTime(source.scraped_at)}</>}
      {source.count != null && <> · {source.count.toLocaleString('en-ZA')} registered parties</>}
      {' '}· Registry data only: no votes or seats.
    </p>
  );
}

export function PartyCard({ p }) {
  return (
    <Link to={`/parties/${p.id}`} className="report-card party-card">
      <PartyLogo party={p} />
      <div style={{ minWidth: 0 }}>
        <h3 style={{ margin: 0 }}>{p.name}</h3>
        <div className="small muted">{p.abbreviation || 'No abbreviation registered'}</div>
        <div className="badges" style={{ marginTop: 6 }}>{p.levels.map((l) => <span key={l} className="badge">{l}</span>)}</div>
      </div>
    </Link>
  );
}

export default function Parties() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') || '';
  const level = params.get('level') || 'all';
  const hasLogo = params.get('has_logo') || '';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const [term, setTerm] = useState(q);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const set = (patch) => {
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([k, v]) => (v && v !== 'all' ? next.set(k, v) : next.delete(k)));
    if (!('page' in patch)) next.delete('page');
    setParams(next, { replace: true });
  };

  useEffect(() => {
    const t = setTimeout(() => { if (term !== q) set({ q: term.trim() }); }, 300);
    return () => clearTimeout(t);
  }, [term]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let live = true;
    setError('');
    api(`/parties${qs({ q, level, has_logo: hasLogo, limit: PAGE, offset: (page - 1) * PAGE })}`)
      .then((d) => live && setData(d))
      .catch((e) => live && setError(e.message));
    return () => { live = false; };
  }, [q, level, hasLogo, page]);

  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE)) : 1;

  return (
    <div className="container page">
      <h1>Registered political parties</h1>
      <p className="muted">The official register of political parties from the Electoral Commission of South Africa (IEC). This is real registry data, not a ranking or an endorsement.</p>

      <div className="card tight" style={{ marginTop: 16 }}>
        <div className="party-filters">
          <div>
            <label className="xs muted" htmlFor="pq" style={{ fontWeight: 600, display: "block", marginBottom: 4 }}>Search name or abbreviation</label>
            <input id="pq" className="input" type="search" value={term} placeholder="e.g. alliance, ANC, GOOD" onChange={(e) => setTerm(e.target.value)} />
          </div>
          <div>
            <label className="xs muted" htmlFor="plevel" style={{ fontWeight: 600, display: "block", marginBottom: 4 }}>Registration level</label>
            <select id="plevel" className="input" value={level} onChange={(e) => set({ level: e.target.value })}>
              <option value="all">All levels</option>
              {LEVELS.map((l) => <option key={l}>{l}</option>)}
            </select>
          </div>
          <label className="small" style={{ display: 'flex', alignItems: 'center', gap: 6, alignSelf: 'end', paddingBottom: 8 }}>
            <input type="checkbox" checked={hasLogo === 'true'} onChange={(e) => set({ has_logo: e.target.checked ? 'true' : '' })} /> Has logo
          </label>
        </div>
      </div>

      {error && <Notice kind="warn">{error}</Notice>}
      {data && (
        <>
          <p className="small muted" style={{ marginTop: 14 }} aria-live="polite">
            {data.total.toLocaleString('en-ZA')} {data.total === 1 ? 'party' : 'parties'}{q && <> matching “{q}”</>}{level !== 'all' && <> at {level} level</>}
          </p>
          <div className="party-grid">
            {data.items.map((p) => <PartyCard key={p.id} p={p} />)}
          </div>
          {data.total === 0 && <p className="muted">No registered party matches. Try a shorter search.</p>}
          {pages > 1 && (
            <div className="row" style={{ justifyContent: 'center', gap: 10, marginTop: 18 }}>
              <button className="btn btn-sm" disabled={page <= 1} onClick={() => set({ page: String(page - 1) })}>Previous</button>
              <span className="small muted">Page {page} of {pages}</span>
              <button className="btn btn-sm" disabled={page >= pages} onClick={() => set({ page: String(page + 1) })}>Next</button>
            </div>
          )}
          <RegistrySource source={data.source} />
        </>
      )}
      {!data && !error && <p className="muted">Loading the IEC register…</p>}
    </div>
  );
}

export function PartyDetail() {
  const { id } = useParams();
  const [p, setP] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    setP(null); setError('');
    api(`/parties/${encodeURIComponent(id)}`).then(setP).catch((e) => setError(e.status === 404 ? 'This party is not in the IEC register.' : e.message));
  }, [id]);

  if (error) return <div className="container page"><div className="crumbs"><Link to="/parties">Parties</Link></div><Notice kind="warn">{error}</Notice></div>;
  if (!p) return <div className="container page muted">Loading…</div>;
  const web = p.website && (/^https?:\/\//i.test(p.website) ? p.website : `https://${p.website}`);
  return (
    <div className="container page">
      <div className="crumbs"><Link to="/parties">Parties</Link> / {p.name}</div>
      <div className="row" style={{ gap: 16, alignItems: 'center', margin: '8px 0 16px' }}>
        <PartyLogo party={p} size={96} />
        <div style={{ minWidth: 0 }}>
          <h1 style={{ margin: 0, overflowWrap: 'anywhere' }}>{p.name}</h1>
          <div className="muted">{p.abbreviation || 'No abbreviation registered'}</div>
          <div className="badges" style={{ marginTop: 6 }}>{p.levels.map((l) => <Link key={l} to={`/parties?level=${l}`} className="badge">{l} level</Link>)}</div>
        </div>
      </div>
      <section className="card">
        <h2>Registration details</h2>
        <p className="small muted">As published in the IEC register of political parties. Contact details are those the party gave the IEC.</p>
        <dl className="party-kv">
          <dt>Registered name</dt><dd>{p.display_name}</dd>
          <dt>Registration level</dt><dd>{p.levels.join(', ') || '—'}</dd>
          <dt>Contact person</dt><dd>{p.contact_person || '—'}</dd>
          <dt>Telephone</dt><dd>{p.telephone ? <a href={`tel:${p.telephone.replace(/[^\d+]/g, '')}`}>{p.telephone}</a> : '—'}</dd>
          <dt>Email</dt><dd>{p.email ? <a href={`mailto:${p.email}`}>{p.email}</a> : '—'}</dd>
          <dt>Address</dt><dd>{p.address || '—'}</dd>
          <dt>Website</dt><dd>{web ? <a href={web} target="_blank" rel="noreferrer nofollow">{p.website}</a> : '—'}</dd>
          <dt>Logo source</dt><dd>{p.source_logo_url ? <a href={p.source_logo_url} target="_blank" rel="noreferrer">elections.org.za</a> : 'No logo on file'}</dd>
        </dl>
        <Notice>Registration means a party may contest elections at this level. It says nothing about votes won, seats held or performance.</Notice>
        <RegistrySource source={p.source} />
      </section>
    </div>
  );
}
