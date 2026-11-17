import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, qs } from '../api.js';
import { Notice } from '../components.jsx';

function WeeklyChart({ weekly }) {
  const W = 760, H = 240, pad = { l: 36, r: 10, t: 10, b: 28 };
  const max = Math.max(5, ...weekly.map((w) => w.official + w.user_reported));
  const nice = Math.ceil(max / 5) * 5;
  const bw = (W - pad.l - pad.r) / weekly.length;
  const y = (v) => H - pad.b - (v / nice) * (H - pad.t - pad.b);
  const ticks = [0, nice / 2, nice];
  return (
    <figure style={{ margin: 0 }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Reports received per week, split into officially confirmed and user-reported">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="#e2dccf" />
            <text x={pad.l - 6} y={y(t) + 4} fontSize="11" textAnchor="end" fill="#5d6b69">{t}</text>
          </g>
        ))}
        {weekly.map((w, i) => {
          const x = pad.l + i * bw + bw * 0.18;
          const width = bw * 0.64;
          return (
            <g key={w.week}>
              <title>{`${w.week} (from ${w.start}): ${w.official} officially confirmed, ${w.user_reported} user-reported`}</title>
              <rect x={x} y={y(w.official)} width={width} height={y(0) - y(w.official)} fill="#0e5550" />
              <rect x={x} y={y(w.official + w.user_reported)} width={width} height={y(w.official) - y(w.official + w.user_reported)} fill="#9cc3bd" />
              <text x={x + width / 2} y={H - 10} fontSize="11" textAnchor="middle" fill="#5d6b69">{w.week}</text>
            </g>
          );
        })}
      </svg>
      <figcaption className="row small" style={{ gap: 16 }}>
        <span className="legend-item"><i style={{ background: '#0e5550', borderRadius: 2 }} />Officially confirmed</span>
        <span className="legend-item"><i style={{ background: '#9cc3bd', borderRadius: 2 }} />User-reported</span>
      </figcaption>
    </figure>
  );
}

export default function Performance() {
  const { slug } = useParams();
  const [cats, setCats] = useState([]);
  const [muni, setMuni] = useState(null);
  const [f, setF] = useState({ from: '', to: '', category: 'all', ward: '', source: 'all' });
  const [d, setD] = useState(null);
  useEffect(() => { api('/categories').then(setCats); api(`/municipalities/${slug}`).then(setMuni); }, [slug]);
  useEffect(() => { api(`/municipalities/${slug}/performance${qs(f)}`).then((x) => { setD(x); if (!f.from) setF((o) => ({ ...o, from: x.period.from, to: x.period.to })); }); }, [slug, f]);
  const set = (k, v) => setF((o) => ({ ...o, [k]: v }));

  return (
    <div className="container page">
      <div className="crumbs"><Link to={`/municipalities/${slug}`}>{muni?.name || 'Municipality'}</Link> / Performance</div>
      <h1>Service reports and responses</h1>
      <p className="muted" style={{ maxWidth: 720 }}>What residents have reported on this platform and how those reports have progressed. This is not an official performance rating and does not rank anyone.</p>

      <div className="card tight" style={{ margin: '16px 0' }}>
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <div><label className="xs muted" htmlFor="p-from" style={{ display: 'block', fontWeight: 600 }}>Period from</label><input id="p-from" type="date" className="input" value={f.from} onChange={(e) => set('from', e.target.value)} /></div>
          <div><label className="xs muted" htmlFor="p-to" style={{ display: 'block', fontWeight: 600 }}>to</label><input id="p-to" type="date" className="input" value={f.to} onChange={(e) => set('to', e.target.value)} /></div>
          <div><label className="xs muted" htmlFor="p-cat" style={{ display: 'block', fontWeight: 600 }}>Category</label>
            <select id="p-cat" className="input" value={f.category} onChange={(e) => set('category', e.target.value)}><option value="all">All categories</option>{cats.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}</select></div>
          <div><label className="xs muted" htmlFor="p-ward" style={{ display: 'block', fontWeight: 600 }}>Ward</label>
            <select id="p-ward" className="input" value={f.ward} onChange={(e) => set('ward', e.target.value)}><option value="">All wards</option>{muni?.wards.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></div>
          <div><label className="xs muted" htmlFor="p-src" style={{ display: 'block', fontWeight: 600 }}>Status source</label>
            <select id="p-src" className="input" value={f.source} onChange={(e) => set('source', e.target.value)}><option value="all">All</option><option value="official">Has official response</option><option value="user_reported">User-reported only</option></select></div>
          <a className="btn" style={{ marginLeft: 'auto' }} href={`/api/municipalities/${slug}/performance.csv${qs(f)}`}>Download data (CSV)</a>
        </div>
      </div>

      <Notice>
        <strong>Read with care.</strong> A high number of reports can reflect population size, how many people use the platform, connectivity or public awareness.
        It is not, by itself, proof of worse service delivery. All figures here are computed from illustrative sample data.
      </Notice>

      {d && (
        <>
          <div className="kpis" style={{ marginTop: 18 }}>
            {d.metrics.map((m) => (
              <div key={m.key} className="kpi card">
                <div className="label">{m.title}</div>
                <div className={`value ${m.value === 'Not available' || m.value === 'No data' ? 'na' : ''}`}>{m.value}</div>
                <div className="small muted">{m.sub}</div>
                <div className="metric-meta">
                  <span><b>Period:</b> {m.period} · <b>Reports included:</b> {String(m.included)}</span>
                  <span><b>Method:</b> {m.method}</span>
                  <span><b>Source:</b> {m.source} · <b>Missing data:</b> {m.missing}</span>
                  <span><b>Verification:</b> {m.verification}</span>
                </div>
              </div>
            ))}
          </div>

          <section className="card" style={{ marginTop: 20 }}>
            <h2>Reports received per week</h2>
            <p className="small muted">Bars show counts by observed date. Darker part = reports whose current status is officially confirmed; lighter part = user-reported status only.</p>
            <WeeklyChart weekly={d.weekly} />
          </section>

          <section className="card" style={{ marginTop: 20 }}>
            <h2>Definitions and method</h2>
            <div className="table-wrap">
              <table className="t">
                <thead><tr><th>Term</th><th>Definition used on this platform</th><th>Status</th></tr></thead>
                <tbody>{d.definitions.map((x) => <tr key={x.term}><td><strong>{x.term}</strong></td><td>{x.definition}</td><td><span className="badge">{x.status}</span></td></tr>)}</tbody>
              </table>
            </div>
            <p className="small muted" style={{ marginTop: 10 }}>Comparisons between areas, if shown, use the same period and show population and report-volume context. There is no ranking and no single score. <Link to="/methods">Read the full methodology</Link></p>
          </section>
        </>
      )}
    </div>
  );
}
