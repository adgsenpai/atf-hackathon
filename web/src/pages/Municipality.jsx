import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, qs } from '../api.js';
import { Notice, SourceLine, TextDialog, useRequireSignIn } from '../components.jsx';
import { PartyCard, RegistrySource } from './Parties.jsx';

const TABS = [['responsibilities', 'Responsibilities'], ['elections', 'Election results'], ['council', 'Current council'], ['parties', 'Registered parties'], ['performance', 'Performance']];

export default function Municipality() {
  const { slug } = useParams();
  const [m, setM] = useState(null);
  const [el, setEl] = useState(null);
  const [year, setYear] = useState('');
  const [council, setCouncil] = useState(null);
  const [perf, setPerf] = useState(null);
  const [parties, setParties] = useState(null);
  const [showAllParties, setShowAllParties] = useState(false);
  const [tab, setTab] = useState('responsibilities');
  const [correction, setCorrection] = useState(null);
  const needUser = useRequireSignIn();

  useEffect(() => {
    api(`/municipalities/${slug}`).then(setM);
    api(`/municipalities/${slug}/council`).then(setCouncil);
    api(`/municipalities/${slug}/performance`).then(setPerf);
    api(`/municipalities/${slug}/parties`).then(setParties).catch((e) => setParties({ error: e.message }));
  }, [slug]);
  useEffect(() => { api(`/municipalities/${slug}/elections${qs({ year })}`).then(setEl); }, [slug, year]);

  if (!m) return <div className="container page muted">Loading…</div>;
  const go = (id) => { setTab(id); document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
  const metric = (k) => perf?.metrics.find((x) => x.key === k);
  const maxShare = Math.max(1, ...(el?.results || []).map((x) => x.share));

  return (
    <div className="container page">
      <div className="crumbs"><Link to="/municipalities">Municipalities</Link> / {m.province} / {m.name}</div>
      <h1>{m.name}</h1>
      <p className="muted">{m.kind}{m.is_pilot && ' · Pilot municipality'} · Wards: {m.wards_note} (sample boundaries loaded: {m.wards.length})</p>

      <div className="tabs" role="tablist">
        {TABS.map(([id, label]) => <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'active' : ''} onClick={() => go(id)}>{label}</button>)}
      </div>

      <Notice kind="info">
        <strong>Three separate kinds of information.</strong> Election results (what voters chose), current council composition (who sits on the council now) and
        service performance (what residents report) are shown separately and are never combined into a score.
      </Notice>

      <section id="responsibilities" className="card" style={{ marginTop: 20, scrollMarginTop: 90 }}>
        <h2>Who is responsible for what?</h2>
        <p className="small muted">Responsibility can sit with the municipality, a utility, the province or national government.</p>
        <div className="table-wrap">
          <table className="t">
            <thead><tr><th>Service</th><th>Usually responsible</th><th>Official channel</th><th>Verification</th></tr></thead>
            <tbody>
              {m.responsibilities.map((x) => (
                <tr key={x.id}><td><strong>{x.service}</strong></td><td>{x.responsible}</td><td>{x.channel}</td><td><span className="badge warn">{x.verification}</span></td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <SourceLine s={m.responsibilities_source} extra={<> · <button className="linkbtn" onClick={() => needUser() && setCorrection({ target_type: 'responsibility', target_id: m.id })}>Request a correction</button></>} />
      </section>

      <section id="elections" className="card" style={{ marginTop: 20, scrollMarginTop: 90 }}>
        <div className="row between">
          <div>
            <h2>Official election results</h2>
            <p className="small muted">Dataset A · {el?.election?.level} · Source preferred: Electoral Commission of South Africa (IEC)</p>
          </div>
          {el?.years?.length > 0 && (
            <div>
              <label className="xs muted" htmlFor="year" style={{ display: 'block', fontWeight: 600 }}>Election year</label>
              <select id="year" className="input" value={year || el.election?.year} onChange={(e) => setYear(e.target.value)}>
                {el.years.map((y) => <option key={y}>{y}</option>)}
              </select>
            </div>
          )}
        </div>
        <Notice>Past results do not necessarily describe who controls the council today. See “Current council” below for the present arrangement.</Notice>
        <div className="table-wrap" style={{ marginTop: 14 }}>
          <table className="t">
            <thead><tr><th>Party</th><th className="num">Votes</th><th className="num">Share of votes</th><th>Share (bar)</th><th className="num">Seats</th></tr></thead>
            <tbody>
              {el?.results.map((x) => (
                <tr key={x.party}>
                  <td>{x.party}</td><td className="num">{x.votes.toLocaleString('en-ZA')}</td><td className="num">{x.share.toFixed(1)}%</td>
                  <td><div className="bar" aria-hidden><span style={{ width: `${(x.share / maxShare) * 100}%` }} /></div></td><td className="num">{x.seats}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="xs muted">All bars use one neutral colour. Parties are not colour-coded. {el?.election?.is_sample && 'Sample rows show layout only; no real results appear in this MVP.'}</p>
        <SourceLine s={el?.source} extra={<> · <button className="linkbtn" onClick={() => needUser() && setCorrection({ target_type: 'election', target_id: el?.election?.id })}>Report an error</button></>} />
      </section>

      <section id="council" className="card" style={{ marginTop: 20, scrollMarginTop: 90 }}>
        <h2>Current council composition</h2>
        <p className="small muted">Dataset B · A dated snapshot, separate from election results. It can change after by-elections, resignations or floor-crossing.</p>
        {council?.snapshot && (
          <div className="two-col" style={{ gridTemplateColumns: 'minmax(0,1fr) 300px' }}>
            <div>
              <div className="badges" style={{ marginBottom: 10 }}>
                <span className="badge">Snapshot as of {council.snapshot.as_of}</span>
                <span className="badge warn">{council.snapshot.verification}</span>
              </div>
              <div className="table-wrap">
                <table className="t">
                  <thead><tr><th>Party</th><th className="num">Seats now</th><th className="num">Change since election</th></tr></thead>
                  <tbody>
                    {council.seats.map((s) => (
                      <tr key={s.party}><td>{s.party}</td><td className="num">{s.seats_now}</td><td className="num">{s.change > 0 ? `+${s.change}` : s.change === 0 ? '±0' : s.change}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="stack">
              <div className="card tight" style={{ background: '#faf8f3' }}>
                <h3>Governing arrangement</h3>
                <div className="small">Type: {council.snapshot.arrangement_type}<br />Executive mayor: {council.snapshot.executive_mayor}<br />Effective from: {council.snapshot.effective_from}</div>
                <div className="xs muted" style={{ marginTop: 6 }}>Source: {council.snapshot.source}</div>
              </div>
              <div>
                <h3>Changes with effective dates</h3>
                <ul className="small" style={{ paddingLeft: 18, margin: 0 }}>
                  {council.changes.map((c, i) => <li key={i}>{c.effective_date} — {c.description} {c.source_url && <a href={c.source_url}>(source link)</a>}</li>)}
                </ul>
              </div>
            </div>
          </div>
        )}
        <SourceLine s={council?.source} extra={<> · Rule: {council?.rule?.toLowerCase()}</>} />
      </section>

      <section id="parties" className="card" style={{ marginTop: 20, scrollMarginTop: 90 }}>
        <h2>Registered political parties</h2>
        <p className="small muted">Real data · The Electoral Commission of South Africa (IEC) register of parties. Registration is not representation: this says who may contest, not who won or who governs.</p>
        {parties?.error && <Notice kind="warn">{parties.error}</Notice>}
        {parties && !parties.error && (
          <>
            <div className="badges" style={{ margin: '6px 0 12px' }}>
              <span className="badge">{parties.total} registered at {parties.level} level</span>
              <span className="badge">{parties.items.filter((p) => p.local_address).length} with a registered address in {parties.place.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())}</span>
              <span className="badge">+ {parties.national_total} national parties may also contest</span>
            </div>
            <div className="party-grid">
              {(showAllParties ? parties.items : parties.items.slice(0, 8)).map((p) => (
                <div key={p.id} style={{ position: 'relative' }}>
                  <PartyCard p={p} />
                  {p.local_address && <span className="badge" style={{ position: "absolute", right: 10, bottom: 10 }}>Local address</span>}
                </div>
              ))}
            </div>
            <div className="row" style={{ gap: 12, marginTop: 12 }}>
              {parties.items.length > 8 && <button className="btn btn-sm" onClick={() => setShowAllParties(!showAllParties)}>{showAllParties ? 'Show fewer' : `Show all ${parties.items.length}`}</button>}
              <Link className="btn btn-sm" to={`/parties?level=${parties.level}`}>Open in party directory</Link>
            </div>
            <p className="xs muted" style={{ marginTop: 10 }}>{parties.note} Parties are listed alphabetically, never colour-coded or ranked.</p>
            <RegistrySource source={parties.source} />
          </>
        )}
        {!parties && <p className="muted small">Loading the IEC register…</p>}
      </section>

      <section id="performance" className="card" style={{ marginTop: 20, scrollMarginTop: 90 }}>
        <h2>Service performance (reports on this platform)</h2>
        <p className="small muted">Resident-reported activity, not an official performance rating. No ranking and no single score.</p>
        {perf && (
          <div className="kpis">
            {['received', 'acknowledged', 'median_ack'].map((k) => {
              const x = metric(k);
              return (
                <div key={k} className="kpi card tight">
                  <div className="label">{x.title}</div>
                  <div className="value">{x.value}</div>
                  <div className="xs muted">{perf.period.from} to {perf.period.to} · reports included: {String(x.included)}</div>
                </div>
              );
            })}
          </div>
        )}
        <p style={{ marginTop: 14 }}><Link to={`/municipalities/${slug}/performance`}>Open the performance dashboard with definitions and sources</Link></p>
      </section>

      <TextDialog open={!!correction} onClose={() => setCorrection(null)} title="Request a correction" label="What is wrong, and what is the correct source?"
        help="Include a link to an official source if you have one." submitLabel="Send request"
        onSubmit={(details) => api('/corrections', { method: 'POST', body: { ...correction, details } })} />
    </div>
  );
}
