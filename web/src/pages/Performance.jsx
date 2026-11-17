import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, qs } from '../api.js';
import { Notice } from '../components.jsx';
import { AreaMap } from '../MapView.jsx';

// Status groups: distinct colours, always paired with a text label and a count.
const GROUPS = [
  { key: 'waiting', label: 'Waiting for a response', statuses: ['submitted'], color: '#fab219' },
  { key: 'handling', label: 'Being handled', statuses: ['acknowledged', 'in_progress'], color: '#2a78d6' },
  { key: 'resolved', label: 'Resolved', statuses: ['resolved'], color: '#0ca30c' },
  { key: 'reopened', label: 'Reopened', statuses: ['reopened'], color: '#ec835a' },
  { key: 'needs', label: 'Needs clarification', statuses: ['needs_info'], color: '#6250d6' },
];
const CAT_NAMES = { water: 'Water', electricity: 'Electricity', roads: 'Roads', sanitation: 'Sanitation', waste: 'Waste collection', stormwater: 'Stormwater', public_spaces: 'Public spaces', other: 'Other' };

function StatusBar({ byStatus }) {
  const rows = GROUPS.map((g) => ({ ...g, n: g.statuses.reduce((a, k) => a + (byStatus[k] || 0), 0) }));
  const total = rows.reduce((a, r) => a + r.n, 0) || 1;
  return (
    <div>
      <div className="stackbar" role="img" aria-label={rows.map((r) => `${r.label}: ${r.n}`).join(', ')}>
        {rows.filter((r) => r.n).map((r) => (
          <span key={r.key} style={{ width: `${(r.n / total) * 100}%`, background: r.color }} title={`${r.label}: ${r.n} (${Math.round((r.n / total) * 100)}%)`} />
        ))}
      </div>
      <div className="stack-legend">
        {rows.map((r) => (
          <span key={r.key} className="legend-item"><i style={{ background: r.color }} /><b>{r.n}</b>&nbsp;{r.label} <span className="muted">({Math.round((r.n / total) * 100)}%)</span></span>
        ))}
      </div>
    </div>
  );
}

function CategoryBars({ rows }) {
  const max = Math.max(1, ...rows.map((r) => r.total));
  return (
    <div className="catbars">
      <div className="stack-legend" style={{ marginBottom: 8 }}>
        <span className="legend-item"><i style={{ background: '#0ca30c' }} />Resolved</span>
        <span className="legend-item"><i style={{ background: '#2a78d6' }} />Not yet resolved</span>
      </div>
      {rows.map((r) => (
        <div key={r.category} className="catbar-row" title={`${CAT_NAMES[r.category] || r.category}: ${r.resolved} resolved, ${r.open} not yet resolved`}>
          <span className="catbar-label">{CAT_NAMES[r.category] || r.category}</span>
          <span className="catbar-track">
            <span style={{ width: `${(r.resolved / max) * 100}%`, background: '#0ca30c' }} />
            <span style={{ width: `${(r.open / max) * 100}%`, background: '#2a78d6' }} />
          </span>
          <span className="catbar-val">{r.total} <span className="muted xs">· {Math.round((r.resolved / r.total) * 100)}% resolved</span></span>
        </div>
      ))}
    </div>
  );
}

function Meter({ value, label }) {
  return (
    <div className="meter-row">
      <span className="small">{label}</span>
      <span className="meter"><span style={{ width: `${value ?? 0}%` }} /></span>
      <span className="small" style={{ fontVariantNumeric: 'tabular-nums' }}>{value == null ? '—' : `${value}%`}</span>
    </div>
  );
}

function Accountability({ slug }) {
  const [d, setD] = useState(null);
  useEffect(() => { api(`/municipalities/${slug}/accountability`).then(setD).catch(() => setD(null)); }, [slug]);
  if (!d || !d.items.length) return null;
  return (
    <section className="card" style={{ marginTop: 20 }} id="accountability">
      <div className="row between" style={{ flexWrap: 'wrap', gap: 8 }}>
        <h2 style={{ margin: 0 }}>Ward accountability showcase</h2>
        <span className="badge warn">Demo data · fictional parties</span>
      </div>
      <Notice kind="warn">{d.disclaimer}</Notice>
      <p className="small muted" style={{ marginTop: 10 }}>{d.method}</p>
      <div className="party-acc-grid">
        {d.items.map((p) => (
          <article key={p.party} className="party-acc">
            <h3>{p.party}</h3>
            <div className="small muted">{p.wards} wards · {p.reports} reports in those wards</div>
            <div className="acc-figs">
              <div><b>{p.median_ack_days ?? '—'}</b><span className="xs muted">median days to first response</span></div>
              <div><b>{p.unattended}</b><span className="xs muted">unattended &gt; {d.unattended_days} days</span></div>
            </div>
            <Meter label="Acknowledged" value={p.acknowledged_pct} />
            <Meter label="Within 7 days" value={p.ack_within_7_pct} />
            <Meter label="Resolved" value={p.resolved_pct} />
            {p.did.length > 0 && (
              <div className="acc-list"><h4>✔ Got done</h4>
                <ul>{p.did.map((x) => <li key={x.id}><Link to={`/reports/${x.id}`}>{x.title}</Link> <span className="muted xs">· Ward {x.ward_no}</span></li>)}</ul></div>
            )}
            {p.did_not.length > 0 && (
              <div className="acc-list"><h4>⚠ No response yet</h4>
                <ul>{p.did_not.map((x) => <li key={x.id}><Link to={`/reports/${x.id}`}>{x.title}</Link> <span className="muted xs">· Ward {x.ward_no} · {x.days} days</span></li>)}</ul></div>
            )}
          </article>
        ))}
      </div>
      <p className="xs muted" style={{ marginTop: 10 }}>All parties use the same neutral bar colour and are listed alphabetically. Differences come from random demo data generated with identical odds for every party.</p>
    </section>
  );
}

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
              <rect x={x} y={y(w.official)} width={width} height={y(0) - y(w.official)} fill="#1c5cab" />
              <rect x={x} y={y(w.official + w.user_reported)} width={width} height={y(w.official) - y(w.official + w.user_reported)} fill="#86b6ef" />
              <text x={x + width / 2} y={H - 10} fontSize="11" textAnchor="middle" fill="#5d6b69">{w.week}</text>
            </g>
          );
        })}
      </svg>
      <figcaption className="row small" style={{ gap: 16 }}>
        <span className="legend-item"><i style={{ background: '#1c5cab', borderRadius: 2 }} />Officially confirmed</span>
        <span className="legend-item"><i style={{ background: '#86b6ef', borderRadius: 2 }} />User-reported</span>
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
  const [metric, setMetric] = useState('reports');

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
            <select id="p-ward" className="input" value={f.ward} onChange={(e) => set('ward', e.target.value)}><option value="">All wards</option>{muni?.wards?.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></div>
          <div><label className="xs muted" htmlFor="p-src" style={{ display: 'block', fontWeight: 600 }}>Status source</label>
            <select id="p-src" className="input" value={f.source} onChange={(e) => set('source', e.target.value)}><option value="all">All</option><option value="official">Has official response</option><option value="user_reported">User-reported only</option></select></div>
          <a className="btn" style={{ marginLeft: 'auto' }} href={`/api/municipalities/${slug}/performance.csv${qs(f)}`}>Download data (CSV)</a>
        </div>
      </div>

      <Notice>
        <strong>Read with care.</strong> A high number of reports can reflect population size, how many people use the platform, connectivity or public awareness.
        It is not, by itself, proof of worse service delivery. Boundaries are real (Municipal Demarcation Board); the reports behind these figures are demo activity.
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

          <div className="two-col-even" style={{ marginTop: 20 }}>
            <section className="card">
              <h2>Where reports stand now</h2>
              <p className="small muted">Current status of the {Object.values(d.by_status || {}).reduce((a, b) => a + b, 0)} reports in the period.</p>
              <StatusBar byStatus={d.by_status || {}} />
            </section>
            <section className="card">
              <h2>By service</h2>
              <p className="small muted">Reports per category, split into resolved and not yet resolved.</p>
              <CategoryBars rows={d.by_category || []} />
            </section>
          </div>

          <section className="card" style={{ marginTop: 20 }}>
            <div className="row between" style={{ alignItems: 'flex-end', flexWrap: 'wrap', gap: 10 }}>
              <div>
                <h2 style={{ margin: 0 }}>Ward map</h2>
                <p className="small muted" style={{ margin: 0 }}>Real ward boundaries (MDB). Shading counts all reports for each ward (not only the selected period), never political parties.</p>
              </div>
              <div className="seg" role="group" aria-label="Map shading">
                {[['reports', 'Reports'], ['open', 'Open'], ['resolved_pct', 'Resolved %']].map(([k, label]) => (
                  <button key={k} className={metric === k ? 'active' : ''} onClick={() => setMetric(k)}>{label}</button>
                ))}
              </div>
            </div>
            <div style={{ marginTop: 12 }}><AreaMap focus={slug} metric={metric} className="map md-tall" /></div>
            {d.by_ward?.length > 0 && (
              <div className="table-wrap" style={{ marginTop: 14 }}>
                <table className="t">
                  <thead><tr><th>Busiest wards in the period</th><th className="num">Reports</th><th className="num">Acknowledged</th><th className="num">Resolved</th><th>Resolved share</th></tr></thead>
                  <tbody>
                    {d.by_ward.slice(0, 8).map((w) => (
                      <tr key={w.ward_id}>
                        <td>{w.ward}</td><td className="num">{w.total}</td><td className="num">{w.acked}</td><td className="num">{w.resolved}</td>
                        <td><span className="meter"><span style={{ width: `${Math.round((w.resolved / w.total) * 100)}%` }} /></span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="card" style={{ marginTop: 20 }}>
            <h2>Reports received per week</h2>
            <p className="small muted">Bars show counts by observed date. Darker part = reports whose current status is officially confirmed; lighter part = user-reported status only.</p>
            <WeeklyChart weekly={d.weekly} />
          </section>

          <Accountability slug={slug} />

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
