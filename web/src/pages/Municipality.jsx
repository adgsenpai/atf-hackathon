import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, qs } from '../api.js';
import { Notice, SourceLine, TextDialog, useRequireSignIn } from '../components.jsx';
import { PartyCard, PartyLogo, RegistrySource } from './Parties.jsx';
import { AreaMap } from '../MapView.jsx';

const PartyName = ({ name, registry }) => (registry
  ? <Link to={`/parties/${registry.id}`} className="party-inline" title="IEC registry entry"><PartyLogo party={registry} size={22} />{name}</Link>
  : <>{name}</>);

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
  const [showAllResults, setShowAllResults] = useState(false);
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
      <p className="muted">{m.kind} · {m.code}{m.district && <> · <Link to={`/municipalities/${m.district_slug}`}>{m.district}</Link></>} · {m.wards_note}</p>

      <div className="muni-top">
        {m.category !== 'C'
          ? <AreaMap focus={slug} className="map md" />
          : <div className="card tight"><h3>Local municipalities in this district</h3><ul className="small" style={{ paddingLeft: 18, margin: 0 }}>{m.locals.map((l) => <li key={l.slug}><Link to={`/municipalities/${l.slug}`}>{l.name}</Link> · {l.ward_count} wards</li>)}</ul></div>}
        <div className="card tight">
          <h3>Contact the council</h3>
          <dl className="party-kv small">
            <dt>Switchboard</dt><dd>{m.phone ? <a href={`tel:${m.phone.replace(/\s/g, '')}`}>{m.phone}</a> : 'Not recorded'}</dd>
            <dt>Website</dt><dd>{m.website ? <a href={m.website} target="_blank" rel="noreferrer">{m.website.replace(/^https?:\/\//, '')}</a> : 'Not recorded'}</dd>
            <dt>Address</dt><dd>{m.street_address || 'Not recorded'}</dd>
            <dt>Post</dt><dd>{m.postal_address || 'Not recorded'}</dd>
          </dl>
          <p className="xs muted" style={{ marginTop: 8 }}>Source: National Treasury municipal register. For emergencies call 112 or 10111.</p>
        </div>
      </div>

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
                <tr key={x.id}><td><strong>{x.service}</strong></td><td>{x.responsible}</td><td>{x.channel}</td><td><span className="badge official">{x.verification}</span></td></tr>
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
            <p className="small muted">Dataset A · {el?.election?.title || el?.election?.level} · Electoral Commission of South Africa (IEC), Seat Calculation Detail</p>
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
        {el?.election && (
          <div className="kpis four" style={{ margin: '10px 0 14px' }}>
            <div className="kpi card tight"><div className="label">Total valid votes</div><div className="value">{el.election.total_valid_votes?.toLocaleString('en-ZA')}</div><div className="xs muted">ward and PR ballots combined, as used by the IEC seat calculation</div></div>
            <div className="kpi card tight"><div className="label">{el.election.district_40pct ? 'Directly elected seats' : 'Council seats'}</div><div className="value">{el.election.seats_total}</div><div className="xs muted">{el.election.district_40pct ? 'the other 60% are seconded by the local councils' : 'ward and PR seats together'}</div></div>
            <div className="kpi card tight"><div className="label">Quota</div><div className="value">{el.election.quota?.toLocaleString('en-ZA')}</div><div className="xs muted">votes per seat</div></div>
            <div className="kpi card tight"><div className="label">Independent ward councillors</div><div className="value">{el.election.independents}</div><div className="xs muted">elected outside party lists</div></div>
          </div>
        )}
        <Notice>Past results do not necessarily describe who controls the council today. See “Current council” below for the present arrangement.</Notice>
        <div className="table-wrap" style={{ marginTop: 14 }}>
          <table className="t">
            <thead><tr><th>Party</th><th className="num">Votes</th><th className="num">Share of votes</th><th>Share (bar)</th><th className="num">Seats</th></tr></thead>
            <tbody>
              {(showAllResults ? el?.results || [] : (el?.results || []).filter((x) => x.seats > 0)).map((x) => (
                <tr key={x.party}>
                  <td><PartyName name={x.party} registry={x.registry} /></td><td className="num">{x.votes.toLocaleString('en-ZA')}</td><td className="num">{x.share.toFixed(1)}%</td>
                  <td><div className="bar" aria-hidden><span style={{ width: `${(x.share / maxShare) * 100}%` }} /></div></td><td className="num">{x.seats}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {el?.results?.some((x) => !x.seats) && (
          <button className="btn btn-sm" style={{ marginTop: 10 }} onClick={() => setShowAllResults(!showAllResults)}>
            {showAllResults ? 'Show only parties that won seats' : `Show all ${el.results.length} parties that received votes`}
          </button>
        )}
        <p className="xs muted">{el?.election?.report_url && <><a href={el.election.report_url} target="_blank" rel="noreferrer">Open the IEC seat calculation report</a> · </>}All bars use one neutral colour. Parties are not colour-coded. Party names that exactly match the IEC register link to the registry entry.</p>
        <SourceLine s={el?.source} extra={<> · <button className="linkbtn" onClick={() => needUser() && setCorrection({ target_type: 'election', target_id: el?.election?.id })}>Report an error</button></>} />
      </section>

      <section id="council" className="card" style={{ marginTop: 20, scrollMarginTop: 90 }}>
        <h2>Current council composition</h2>
        <p className="small muted">Dataset B · The council as elected, from the IEC seat allocation. It can change after by-elections, resignations or floor-crossing; the governing arrangement is not inferred from results.</p>
        {council?.snapshot && (
          <div className="two-col" style={{ gridTemplateColumns: 'minmax(0,1fr) 300px' }}>
            <div>
              <div className="badges" style={{ marginBottom: 10 }}>
                <span className="badge">Snapshot as of {council.snapshot.as_of}</span>
                <span className="badge official">{council.snapshot.verification}</span>
              </div>
              <div className="table-wrap">
                <table className="t">
                  <thead><tr><th>Party</th><th className="num">Seats now</th><th className="num">Change vs previous election</th></tr></thead>
                  <tbody>
                    {council.seats.map((s) => (
                      <tr key={s.party}><td><PartyName name={s.party} registry={s.registry} /></td><td className="num">{s.seats_now}</td><td className="num">{s.change > 0 ? `+${s.change}` : s.change === 0 ? '±0' : s.change}</td></tr>
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
                {council.changes.length ? (
                  <ul className="small" style={{ paddingLeft: 18, margin: 0 }}>
                    {council.changes.map((c, i) => <li key={i}>{c.effective_date} — {c.description} {c.source_url && <a href={c.source_url}>(source link)</a>}</li>)}
                  </ul>
                ) : <p className="small muted">No by-elections, resignations or floor-crossing recorded since the council was elected.</p>}
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
