import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, fmtDate } from '../api.js';
import { ReportCard } from '../components.jsx';
import { AreaMap } from '../MapView.jsx';

const n = (x) => (x == null ? '—' : Number(x).toLocaleString('en-ZA'));

function Stat({ value, label, sub }) {
  return (
    <div className="stat">
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
      {sub && <div className="xs muted">{sub}</div>}
    </div>
  );
}

export default function Landing() {
  const nav = useNavigate();
  const [stats, setStats] = useState(null);
  const [latest, setLatest] = useState([]);
  const [parties, setParties] = useState(null);
  const [metric, setMetric] = useState('reports');
  const [picked, setPicked] = useState(null);
  const [q, setQ] = useState('');

  useEffect(() => {
    api('/stats').then(setStats);
    api('/reports?limit=4').then((d) => setLatest(d.items));
    api('/parties/meta').then(setParties).catch(() => setParties(null));
  }, []);

  const resolvedPct = stats?.reports ? Math.round((stats.resolved / stats.reports) * 100) : null;
  const src = Object.fromEntries((stats?.sources || []).map((s) => [s.dataset, s]));

  return (
    <>
      <section className="landing-hero">
        <div className="container hero-grid">
          <div>
            <span className="eyebrow">Western Cape · real boundaries, real election results</span>
            <h1>Know who is responsible.<br />See what gets fixed.</h1>
            <p className="lead">
              Report potholes, leaks, outages and missed bin collections. Follow every report until it is resolved, and see
              exactly which council, ward and service is responsible, using official data from the IEC, the Municipal
              Demarcation Board and National Treasury.
            </p>
            <form className="hero-search" onSubmit={(e) => { e.preventDefault(); nav(`/reports${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`); }}>
              <label className="sr-only" htmlFor="hero-q">Search reports</label>
              <input id="hero-q" className="input" placeholder="Search a street, ward or problem, e.g. water leak" value={q} onChange={(e) => setQ(e.target.value)} />
              <button className="btn btn-primary" type="submit">Search</button>
            </form>
            <div className="row" style={{ gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
              <Link to="/report" className="btn btn-primary btn-lg">Report a problem</Link>
              <a href="#map" className="btn btn-lg">Explore the map</a>
            </div>
          </div>
          <div className="stat-grid" aria-label="Platform at a glance">
            <Stat value={n(stats?.councils)} label="councils covered" sub={`${n(stats?.municipalities)} municipalities + 5 districts`} />
            <Stat value={n(stats?.wards)} label="real wards mapped" sub="MDB 2021 electoral boundaries" />
            <Stat value={stats?.latest_election ?? '—'} label="latest election loaded" sub={`${n(stats?.seats_latest)} council seats (IEC)`} />
            <Stat value={n(parties?.count)} label="registered parties" sub="IEC party register" />
            <Stat value={n(stats?.reports)} label="reports tracked" sub="demo reports" />
            <Stat value={resolvedPct == null ? '—' : `${resolvedPct}%`} label="marked resolved" sub={`${n(stats?.open)} still open`} />
          </div>
        </div>
      </section>

      <div className="container">
        <section id="map" className="landing-section" style={{ scrollMarginTop: 80 }}>
          <div className="row between" style={{ alignItems: 'flex-end', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h2>Every municipality and ward in the Western Cape</h2>
              <p className="muted" style={{ margin: 0 }}>Click a municipality to see its real wards. Shading shows report activity, never political parties.</p>
            </div>
            <div className="seg" role="group" aria-label="Map shading">
              {[['reports', 'Reports'], ['open', 'Open'], ['resolved_pct', 'Resolved %']].map(([k, label]) => (
                <button key={k} className={metric === k ? 'active' : ''} onClick={() => setMetric(k)}>{label}</button>
              ))}
            </div>
          </div>
          <div style={{ marginTop: 14 }}>
            <AreaMap metric={metric} onFocus={setPicked} />
          </div>
          {picked && (
            <div className="card tight picked">
              <div>
                <strong>{picked.name}</strong> <span className="muted small">· {picked.district || 'Metropolitan municipality'} · {picked.ward_count} wards</span>
                <div className="small muted">{picked.reports} reports · {picked.open} open · {picked.resolved} resolved</div>
              </div>
              <div className="row" style={{ gap: 8 }}>
                <Link className="btn btn-sm" to={`/municipalities/${picked.slug}`}>Council, results &amp; responsibilities</Link>
                <Link className="btn btn-sm btn-primary" to={`/municipalities/${picked.slug}/performance`}>Performance</Link>
              </div>
            </div>
          )}
        </section>

        <section className="landing-section steps">
          <h2>How it works</h2>
          <ol className="step-list">
            <li><span className="step-no">1</span><h3>Drop a pin</h3><p className="small muted">We find the real ward and municipality from the official boundary, and show who is legally responsible and how to contact them.</p></li>
            <li><span className="step-no">2</span><h3>Neighbours add evidence</h3><p className="small muted">Others confirm the same problem, add photos and updates. Duplicates are merged so the signal stays clear.</p></li>
            <li><span className="step-no">3</span><h3>Track the response</h3><p className="small muted">Every status shows whether it came from an official response or a resident, and when. Nothing is hidden.</p></li>
          </ol>
        </section>

        <section className="landing-section">
          <div className="row between" style={{ alignItems: 'baseline' }}>
            <h2>Latest reports</h2>
            <Link to="/reports">See all reports →</Link>
          </div>
          <div className="landing-reports">{latest.map((r) => <ReportCard key={r.id} r={r} />)}</div>
        </section>

        <section className="landing-section">
          <h2>Built on official data, with sources on every number</h2>
          <div className="source-grid">
            <div className="card tight">
              <span className="badge official">Real</span>
              <h3>Boundaries</h3>
              <p className="small muted">{src.boundaries?.detail?.counts?.WD ?? 406} wards, {src.boundaries?.detail?.counts?.MN ?? 25} municipalities and 5 districts from the Municipal Demarcation Board ({src.boundaries?.detail?.generation || '2021 electoral boundaries'}), via OpenUp MapIt.</p>
              {src.boundaries?.fetched_at && <p className="xs muted">Fetched {fmtDate(src.boundaries.fetched_at)}</p>}
            </div>
            <div className="card tight">
              <span className="badge official">Real</span>
              <h3>Election results &amp; councils</h3>
              <p className="small muted">IEC seat calculations for every council, 2026 and 2021 Local Government Elections: votes, quota and seats per party.</p>
              {src.elections?.fetched_at && <p className="xs muted">Fetched {fmtDate(src.elections.fetched_at)}</p>}
            </div>
            <div className="card tight">
              <span className="badge official">Real</span>
              <h3>Contacts &amp; responsibilities</h3>
              <p className="small muted">Switchboards, websites and addresses from National Treasury; who does what from the Constitution (Schedules 4B, 5B) and the Municipal Structures Act.</p>
              {src.contacts?.fetched_at && <p className="xs muted">Fetched {fmtDate(src.contacts.fetched_at)}</p>}
            </div>
            <div className="card tight">
              <span className="badge warn">Demo</span>
              <h3>Reports &amp; responses</h3>
              <p className="small muted">Resident reports, comments and the ward accountability showcase are generated demo activity for this hackathon build.</p>
              <p className="xs muted"><Link to="/methods">How we label data</Link></p>
            </div>
          </div>
        </section>

        <section className="principles">
          <div><h3>Status you can trust</h3><p className="small muted">Every status shows whether it is user-reported or confirmed by an official response, and when it changed.</p></div>
          <div><h3>Politics kept separate</h3><p className="small muted">Election results, council composition and service performance live in separate sections, each with sources and dates.</p></div>
          <div><h3>Fair, explained numbers</h3><p className="small muted">No single score and no ranking. Each statistic lists its period, sample size and method. <Link to="/methods">See how we calculate.</Link></p></div>
        </section>
      </div>
    </>
  );
}
