import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, fmtDate } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Notice } from '../components.jsx';
import { PinMap } from '../MapView.jsx';

const today = () => new Date().toISOString().slice(0, 10);

export default function NewReport() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [step, setStep] = useState(1);
  const [cats, setCats] = useState([]);
  const [f, setF] = useState({ category: '', title: '', description: '', street: '', lat: null, lng: null, sensitive: false, observed_on: today() });
  const [geo, setGeo] = useState(null);
  const [files, setFiles] = useState([]);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => { api('/categories').then(setCats); }, []);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));

  const move = useCallback((lat, lng) => {
    setF((x) => ({ ...x, lat, lng }));
    api(`/geo/lookup?lat=${lat}&lng=${lng}`).then(setGeo).catch(() => setGeo(null));
  }, []);

  if (!user) {
    return (
      <div className="container page" style={{ maxWidth: 640 }}>
        <h1>Report a problem</h1>
        <Notice>Emergency? Call your local emergency number. This site is not an emergency service.</Notice>
        <div className="card" style={{ marginTop: 16 }}>
          <p>You need an account to report a problem, so you can follow its status and add updates. Your name is never shown publicly.</p>
          <Link to="/signin?next=/report" className="btn btn-primary">Sign in or create an account</Link>
        </div>
      </div>
    );
  }

  const validate1 = () => {
    const e = {};
    if (!f.category) e.category = 'Choose what kind of problem it is.';
    if (f.lat == null) e.location = 'Place the pin on the map, or use your current location.';
    if (f.title.trim().length < 5) e.title = 'Give a short title (at least 5 characters).';
    if (f.description.trim().length < 10) e.description = 'Describe the problem (at least 10 characters).';
    if (!f.observed_on || f.observed_on > today()) e.observed_on = 'Date observed cannot be in the future.';
    setErrors(e);
    return !Object.keys(e).length;
  };

  const locate = () => {
    if (!navigator.geolocation) return setMsg('Location is not available in this browser.');
    navigator.geolocation.getCurrentPosition(
      (p) => move(p.coords.latitude, p.coords.longitude),
      () => setMsg('Could not get your location. Tap the map to place the pin instead.'),
    );
  };

  const addFiles = (list) => {
    const next = [...files, ...Array.from(list)].slice(0, 4);
    setFiles(next);
  };

  const submit = async () => {
    setBusy(true); setMsg('');
    try {
      const rep = await api('/reports', { method: 'POST', body: f });
      if (files.length) {
        const fd = new FormData();
        files.forEach((x) => fd.append('photos', x));
        await api(`/reports/${rep.id}/photos`, { method: 'POST', body: fd }).catch((e) => setMsg(`Report saved, but photos failed: ${e.message}`));
      }
      nav(`/reports/${rep.id}`);
    } catch (e) {
      setErrors(e.fields || {}); setMsg(e.message);
      if (e.fields) setStep(1);
    } finally { setBusy(false); }
  };

  const catName = cats.find((c) => c.slug === f.category)?.name;

  return (
    <div className="container page" style={{ maxWidth: 720 }}>
      <h1>Report a problem</h1>
      <p className="muted">Step {step} of 3 · {['Details', 'Photos', 'Review and submit'][step - 1]}</p>
      <div className="steps" aria-hidden>{[1, 2, 3].map((s) => <span key={s} className={s <= step ? 'done' : ''} />)}</div>

      {step === 1 && (
        <div className="stack">
          <Notice>Emergency? Call your local emergency number. This form does not send your report to the municipality unless a sending option is shown on the last step.</Notice>

          <div className="card stack">
            <div>
              <div className="field">What kind of problem? <span className="muted">(required)</span></div>
              <div className="tiles" role="radiogroup" aria-label="Problem category">
                {cats.map((c) => (
                  <button type="button" role="radio" aria-checked={f.category === c.slug} key={c.slug}
                    className={`tile ${f.category === c.slug ? 'active' : ''}`} onClick={() => set('category', c.slug)}>{c.name}</button>
                ))}
              </div>
              {errors.category && <div className="error">{errors.category}</div>}
            </div>

            <div>
              <div className="field">Where is it?</div>
              <PinMap lat={f.lat} lng={f.lng} onMove={move} className="map md" />
              <div className="row" style={{ marginTop: 8 }}>
                <button type="button" className="btn btn-sm" onClick={locate}>Use my current location</button>
                <span className="small muted">or tap the map, then drag the pin to adjust.</span>
              </div>
              {f.lat != null && (
                <div className="small" style={{ marginTop: 8 }}>
                  Ward: <strong>{geo?.ward || 'not found'}</strong> · Municipality: <strong>{geo?.municipality || 'not found'}</strong>
                  {geo?.suburb && <> · Suburb: {geo.suburb}</>}
                </div>
              )}
              <div className="help">Ward and municipality are filled in from the pin where boundary data exists, and marked “not found” if not.</div>
              {errors.location && <div className="error">{errors.location}</div>}
            </div>

            <div>
              <label className="field" htmlFor="street">Street or nearest landmark</label>
              <input id="street" className="input" value={f.street} onChange={(e) => set('street', e.target.value)} placeholder="e.g. Protea Road, near the school gate" />
            </div>

            <label className="check">
              <input type="checkbox" checked={f.sensitive} onChange={(e) => set('sensitive', e.target.checked)} />
              <span>Hide my exact pin. Show only the street block or suburb (for sensitive reports).</span>
            </label>

            <div>
              <label className="field" htmlFor="title">Short title</label>
              <input id="title" className="input" value={f.title} onChange={(e) => set('title', e.target.value)} maxLength={120} placeholder="e.g. Deep pothole in the left lane" />
              {errors.title && <div className="error">{errors.title}</div>}
            </div>
            <div>
              <label className="field" htmlFor="desc">What is the problem?</label>
              <textarea id="desc" className="input" value={f.description} onChange={(e) => set('description', e.target.value)} />
              <div className="help">Describe what you see. Please do not name individuals, and do not include phone numbers or home addresses.</div>
              {errors.description && <div className="error">{errors.description}</div>}
            </div>
            <div style={{ maxWidth: 240 }}>
              <label className="field" htmlFor="obs">Date observed</label>
              <input id="obs" type="date" className="input" max={today()} value={f.observed_on} onChange={(e) => set('observed_on', e.target.value)} />
              {errors.observed_on && <div className="error">{errors.observed_on}</div>}
            </div>
          </div>
          {msg && <div className="error">{msg}</div>}
          <div className="row between">
            <Link to="/" className="btn">Cancel</Link>
            <button className="btn btn-primary" onClick={() => validate1() && setStep(2)}>Continue to photos</button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="stack">
          <div className="card stack">
            <div>
              <label className="field" htmlFor="photos">Photos (optional, up to 4)</label>
              <input id="photos" type="file" accept="image/jpeg,image/png" multiple onChange={(e) => addFiles(e.target.files)} disabled={files.length >= 4} />
              <div className="help">JPEG or PNG, up to 8 MB each. Location data is removed from uploaded photos. Avoid faces and house numbers.</div>
            </div>
            {!!files.length && (
              <div className="photos">
                {files.map((x, i) => (
                  <div key={i} className="stack" style={{ gap: 4 }}>
                    <div className="photo"><img src={URL.createObjectURL(x)} alt={`Selected photo ${i + 1}`} /></div>
                    <button className="linkbtn small" onClick={() => setFiles(files.filter((_, j) => j !== i))}>Remove</button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="row between">
            <button className="btn" onClick={() => setStep(1)}>Back</button>
            <button className="btn btn-primary" onClick={() => setStep(3)}>Review</button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="stack">
          <div className="card">
            <dl className="kv">
              <dt>Category</dt><dd>{catName}</dd>
              <dt>Title</dt><dd>{f.title}</dd>
              <dt>Location</dt><dd>{f.street || '—'} · {geo?.ward || 'Ward not found'}{f.sensitive ? ' · exact pin hidden' : ''}</dd>
              <dt>Observed</dt><dd>{fmtDate(f.observed_on)}</dd>
              <dt>Photos</dt><dd>{files.length}</dd>
            </dl>
            <p style={{ marginTop: 14 }}>{f.description}</p>
          </div>
          <Notice kind="info">
            <strong>Sending to municipality:</strong> {geo?.integration
              ? 'This area has an official integration. Your report will be sent to the municipality.'
              : 'No official integration is available for this area. Your report will be published on CivicWatch only. You can also use the municipality’s official channel, shown on the report page.'}
          </Notice>
          {msg && <div className="error">{msg}</div>}
          <div className="row between">
            <button className="btn" onClick={() => setStep(2)}>Back</button>
            <button className="btn btn-primary" onClick={submit} disabled={busy}>{busy ? 'Submitting…' : 'Submit report'}</button>
          </div>
        </div>
      )}
    </div>
  );
}
