import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';

export default function Municipalities() {
  const [list, setList] = useState([]);
  useEffect(() => { api('/municipalities').then(setList); }, []);
  return (
    <div className="container page">
      <h1>Municipalities</h1>
      <p className="muted">Who is responsible for what, official election results, current council composition and resident-reported service activity, each shown separately.</p>
      <div className="stack" style={{ marginTop: 20 }}>
        {list.map((m) => (
          <Link key={m.id} to={`/municipalities/${m.slug}`} className="report-card">
            <div className="badges"><span className="badge cat">{m.province}</span>{m.is_pilot && <span className="badge official">Pilot municipality</span>}</div>
            <h3>{m.name}</h3>
            <div className="small muted">{m.kind} · {m.reports} reports on this platform</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
