import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { AreaMap } from '../MapView.jsx';

export default function Municipalities() {
  const [list, setList] = useState([]);
  const [metric, setMetric] = useState('reports');
  useEffect(() => { api('/municipalities').then(setList); }, []);
  const metro = list.filter((m) => m.category === 'A');
  const districts = list.filter((m) => m.category === 'C');

  const Card = ({ m }) => (
    <Link to={`/municipalities/${m.slug}`} className="report-card">
      <div className="badges"><span className="badge cat">{m.code}</span><span className="badge">{m.kind}</span></div>
      <h3>{m.name}</h3>
      <div className="small muted">{m.category === 'C' ? 'District council' : `${m.ward_count} wards`} · {m.reports} reports · {m.phone || 'No phone recorded'}</div>
    </Link>
  );

  return (
    <div className="container page">
      <h1>Western Cape municipalities</h1>
      <p className="muted" style={{ maxWidth: 760 }}>
        All 30 councils in the Western Cape: the City of Cape Town, 24 local municipalities and the 5 district municipalities they belong to.
        Each has real boundaries and wards, the 2026 and 2021 election results, the council as elected, and who is responsible for which service.
      </p>
      <div className="row between" style={{ margin: '16px 0 10px', flexWrap: 'wrap', gap: 10 }}>
        <span className="small muted">Click an area to drill into its wards, then open its page.</span>
        <div className="seg" role="group" aria-label="Map shading">
          {[['reports', 'Reports'], ['open', 'Open'], ['resolved_pct', 'Resolved %']].map(([k, label]) => (
            <button key={k} className={metric === k ? 'active' : ''} onClick={() => setMetric(k)}>{label}</button>
          ))}
        </div>
      </div>
      <AreaMap metric={metric} />

      <h2 style={{ marginTop: 28 }}>Metropolitan municipality</h2>
      <div className="party-grid">{metro.map((m) => <Card key={m.id} m={m} />)}</div>

      {districts.map((d) => (
        <section key={d.id} id={d.code} style={{ marginTop: 28, scrollMarginTop: 80 }}>
          <div className="row between" style={{ alignItems: 'baseline' }}>
            <h2 style={{ margin: 0 }}>{d.name}</h2>
            <Link to={`/municipalities/${d.slug}`} className="small">District council page →</Link>
          </div>
          <div className="party-grid" style={{ marginTop: 10 }}>
            {list.filter((m) => m.district_code === d.code).map((m) => <Card key={m.id} m={m} />)}
          </div>
        </section>
      ))}
      {list.length > 0 && <p className="source" style={{ marginTop: 24 }}>Sources: Municipal Demarcation Board boundaries via OpenUp MapIt · National Treasury municipal register · IEC seat calculations.</p>}
    </div>
  );
}
