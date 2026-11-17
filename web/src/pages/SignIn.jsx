import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth.jsx';

const DEMO = [
  ['resident@example.org', 'Resident'],
  ['official@example.org', 'Verified municipality representative'],
  ['moderator@example.org', 'Moderator'],
  ['admin@example.org', 'Senior moderator (admin)'],
];

export default function SignIn() {
  const { signIn } = useAuth();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e, demoEmail) => {
    e?.preventDefault();
    setErr(''); setBusy(true);
    try {
      const u = await signIn(demoEmail || email, demoEmail ? 'civicwatch' : password, !demoEmail && mode === 'register');
      nav(params.get('next') || (u.role === 'moderator' || u.role === 'admin' ? '/moderation' : '/'));
    } catch (x) { setErr(x.message); } finally { setBusy(false); }
  };

  return (
    <div className="container page" style={{ maxWidth: 480 }}>
      <h1>{mode === 'login' ? 'Sign in' : 'Create an account'}</h1>
      <p className="muted">Your email is never shown. Other residents see a pseudonym like “Resident 482”.</p>
      <form className="card stack" onSubmit={submit}>
        <div><label className="field" htmlFor="email">Email</label><input id="email" type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" /></div>
        <div><label className="field" htmlFor="pw">Password</label><input id="pw" type="password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={mode === 'register' ? 8 : 1} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} /></div>
        {err && <div className="error">{err}</div>}
        <button className="btn btn-primary" disabled={busy}>{mode === 'login' ? 'Sign in' : 'Create account'}</button>
        <button type="button" className="linkbtn small" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
          {mode === 'login' ? 'New here? Create an account' : 'Already have an account? Sign in'}
        </button>
      </form>
      <div className="card" style={{ marginTop: 16 }}>
        <h3>Demo accounts</h3>
        <p className="small muted">Password for all: <code>civicwatch</code></p>
        <div className="stack" style={{ gap: 6 }}>
          {DEMO.map(([e, label]) => (
            <button key={e} className="btn btn-sm" style={{ justifyContent: 'space-between' }} onClick={() => submit(null, e)} disabled={busy}>
              <span>{label}</span><span className="muted xs">{e}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
