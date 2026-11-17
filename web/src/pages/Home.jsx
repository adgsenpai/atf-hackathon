import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, qs } from '../api.js';
import { Notice, ReportCard } from '../components.jsx';
import { ReportsMap } from '../MapView.jsx';

export default function Home({ listOnly }) {
  const [params, setParams] = useSearchParams();
  const [cats, setCats] = useState([]);
  const [wards, setWards] = useState([]);
  const [data, setData] = useState({ total: 0, items: [] });
  const [mapItems, setMapItems] = useState([]);
  const [text, setText] = useState(params.get('q') || '');
  const [mode, setMode] = useState('list');
  const [showFilters, setShowFilters] = useState(() => window.innerWidth > 900);
  const [limit, setLimit] = useState(listOnly ? 20 : 5);

  const filters = useMemo(() => ({
    q: params.get('q') || '', category: params.get('category') || 'all',
    status: params.get('status') || 'all', days: params.get('days') || '', ward: params.get('ward') || '',
  }), [params]);
  const set = (k, v) => { const p = new URLSearchParams(params); v && v !== 'all' ? p.set(k, v) : p.delete(k); setParams(p, { replace: true }); };

  useEffect(() => { api('/categories').then(setCats); api('/wards').then(setWards); }, []);
  useEffect(() => {
    api(`/reports${qs({ ...filters, limit })}`).then(setData);
  }, [filters, limit]);
  useEffect(() => {
    api(`/reports${qs({ ...filters, limit: 500 })}`).then((d) => setMapItems(d.items));
  }, [filters]);

  const activeFilters = ['status', 'days', 'ward'].filter((k) => filters[k] && filters[k] !== 'all').length;

  return (
    <div className="container">
      {!listOnly && (
        <section className="hero">
          <h1>See what is broken in your area,<br />and whether anyone has responded.</h1>
          <p className="lead">Report municipal service problems, add updates to existing reports, and follow their status over time.</p>
        </section>
      )}
      {listOnly && <div className="page" style={{ paddingBottom: 12 }}><h1>Reports</h1></div>}

      <form className="stack" onSubmit={(e) => { e.preventDefault(); set('q', text.trim()); }}>
        <div>
          <label className="field" htmlFor="search">Search by street, suburb, ward or keyword</label>
          <div className="search">
            <input id="search" className="input" placeholder="e.g. Protea Road, water leak" value={text} onChange={(e) => setText(e.target.value)} />
            <button className="btn btn-primary" type="submit">Search</button>
          </div>
        </div>
        <div className="chips scroll" role="group" aria-label="Category">
          <button type="button" className={`chip ${filters.category === 'all' ? 'active' : ''}`} onClick={() => set('category', 'all')}>All</button>
          {cats.map((c) => (
            <button type="button" key={c.slug} className={`chip ${filters.category === c.slug ? 'active' : ''}`} onClick={() => set('category', c.slug)}>{c.name}</button>
          ))}
        </div>
      </form>

      <div style={{ margin: '20px 0' }}>
        <Notice>
          <strong>Reports are submitted by residents and may be unverified.</strong> A report is marked “Sent to municipality” only when it went through an official
          integration or the municipality has responded. For emergencies, call your local emergency number, not this site.
        </Notice>
      </div>

      <div className="row between" style={{ marginBottom: 6 }}>
        <h2 style={{ margin: 0 }}>{listOnly ? 'All reports' : 'Latest reports near you'} <span className="small muted" style={{ fontFamily: 'var(--sans)', fontWeight: 400 }}>· {data.items.length} of {data.total} shown</span></h2>
        <div className="row">
          <div className="seg" role="group" aria-label="View">
            <button className={mode === 'list' ? 'active' : ''} onClick={() => setMode('list')}>List</button>
            <button className={mode === 'map' ? 'active' : ''} onClick={() => setMode('map')}>Map</button>
          </div>
          <button className="btn btn-sm" onClick={() => setShowFilters(!showFilters)} aria-expanded={showFilters}>Filters{activeFilters ? ` (${activeFilters})` : ''}</button>
        </div>
      </div>

      {showFilters && (
        <div className="filters">
          <div>
            <label htmlFor="f-status">Status</label>
            <select id="f-status" className="input" value={filters.status} onChange={(e) => set('status', e.target.value)}>
              <option value="all">All statuses</option>
              <option value="open">Open (any)</option>
              <option value="submitted">Submitted</option>
              <option value="acknowledged">Acknowledged</option>
              <option value="in_progress">In progress</option>
              <option value="resolved">Resolved</option>
              <option value="reopened">Reopened</option>
              <option value="needs_info">Needs clarification</option>
            </select>
          </div>
          <div>
            <label htmlFor="f-date">Date observed</label>
            <select id="f-date" className="input" value={filters.days} onChange={(e) => set('days', e.target.value)}>
              <option value="">All time</option>
              <option value="7">Last 7 days</option>
              <option value="30">Last 30 days</option>
              <option value="90">Last 90 days</option>
            </select>
          </div>
          <div>
            <label htmlFor="f-ward">Ward</label>
            <select id="f-ward" className="input" value={filters.ward} onChange={(e) => set('ward', e.target.value)}>
              <option value="">All wards</option>
              {wards.map((w) => <option key={w.id} value={w.id}>{w.name} · {w.suburb}</option>)}
            </select>
          </div>
        </div>
      )}

      <div className={`browse mode-${mode}`} style={{ marginTop: 12 }}>
        <div className="list-col">
          <div className="report-list">
            {data.items.map((r) => <ReportCard key={r.id} r={r} />)}
            {!data.items.length && <div className="card empty">No reports match these filters.</div>}
          </div>
          {data.items.length < data.total && (
            <p style={{ marginTop: 14 }}>
              {listOnly
                ? <button className="btn" onClick={() => setLimit(limit + 20)}>Show more</button>
                : <Link to={`/reports${qs(filters)}`}>View all reports</Link>}
            </p>
          )}
        </div>
        <div className="map-col">
          <ReportsMap reports={mapItems} wards={wards} />
          <p className="xs muted" style={{ marginTop: 6 }}>Numbered pins group nearby reports. Location precision can be reduced for sensitive reports. Ward boundaries shown are illustrative samples.</p>
        </div>
      </div>

      <section className="principles">
        <div><h3>Status you can trust</h3><p className="small muted">Every status shows whether it is user-reported or confirmed by an official response, and when it changed.</p></div>
        <div><h3>Politics kept separate</h3><p className="small muted">Election results, current council control and service performance are shown in separate sections, each with sources and dates.</p></div>
        <div><h3>Fair, explained numbers</h3><p className="small muted">No single score. Each statistic lists its period, sample size and method. <Link to="/methods">See how we calculate.</Link></p></div>
      </section>
    </div>
  );
}
