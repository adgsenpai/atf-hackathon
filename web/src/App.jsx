import { useEffect, useState } from 'react';
import { Link, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import Home from './pages/Home.jsx';
import NewReport from './pages/NewReport.jsx';
import ReportDetail from './pages/ReportDetail.jsx';
import Municipalities from './pages/Municipalities.jsx';
import Municipality from './pages/Municipality.jsx';
import Performance from './pages/Performance.jsx';
import Moderation from './pages/Moderation.jsx';
import SignIn from './pages/SignIn.jsx';
import Parties from './pages/Parties.jsx';
import { Methods, Rules, NotFound } from './pages/Static.jsx';

function Header() {
  const { user, signOut, isMod } = useAuth();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  const nav = useNavigate();
  useEffect(() => setOpen(false), [loc.pathname]);
  return (
    <>
      <div className="pilotbar">Pilot area: City of Cape Town · This MVP uses illustrative sample data only</div>
      <header className="header">
        <div className="container">
          <Link to="/" className="brand" aria-label="CivicWatch Africa home">
            <span className="brand-mark" aria-hidden>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.6"><circle cx="12" cy="10" r="5" /><path d="M12 15v6" /></svg>
            </span>
            CivicWatch Africa
          </Link>
          <nav className={`nav ${open ? 'open' : ''}`} aria-label="Main">
            <NavLink to="/reports">Reports</NavLink>
            <NavLink to="/municipalities">Municipalities</NavLink>
            <NavLink to="/parties">Parties</NavLink>
            <NavLink to="/methods">Data &amp; methods</NavLink>
            <NavLink to="/rules">Community rules</NavLink>
            {isMod && <NavLink to="/moderation">Moderation</NavLink>}
            {user
              ? <button className="linkbtn show-sm" style={{ textAlign: 'left' }} onClick={() => { signOut(); nav('/'); }}>Sign out ({user.pseudonym})</button>
              : <NavLink to="/signin" className="show-sm">Sign in</NavLink>}
          </nav>
          <div className="header-actions" style={{ marginLeft: 'auto' }}>
            <button className="btn btn-sm menu-btn" onClick={() => setOpen(!open)} aria-expanded={open}>Menu</button>
            {user ? (
              <>
                <span className="small muted hide-sm" title={user.email}>{user.pseudonym}{user.role !== 'resident' && ` · ${user.role}`}</span>
                <button className="btn btn-sm hide-sm" onClick={() => { signOut(); nav('/'); }}>Sign out</button>
              </>
            ) : (
              <Link to="/signin" className="btn btn-sm hide-xs">Sign in</Link>
            )}
            <Link to="/report" className="btn btn-primary btn-sm"><span className="hide-xs">Report a problem</span><span className="show-xs">Report</span></Link>
          </div>
        </div>
      </header>
    </>
  );
}

export default function App() {
  const { ready } = useAuth();
  if (!ready) return null;
  return (
    <>
      <Header />
      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/reports" element={<Home listOnly />} />
          <Route path="/reports/:id" element={<ReportDetail />} />
          <Route path="/report" element={<NewReport />} />
          <Route path="/municipalities" element={<Municipalities />} />
          <Route path="/municipalities/:slug" element={<Municipality />} />
          <Route path="/municipalities/:slug/performance" element={<Performance />} />
          <Route path="/parties" element={<Parties />} />
          <Route path="/moderation/*" element={<Moderation />} />
          <Route path="/signin" element={<SignIn />} />
          <Route path="/methods" element={<Methods />} />
          <Route path="/rules" element={<Rules />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      <footer className="footer">
        <div className="container row between">
          <span>CivicWatch Africa · Resident reports may be unverified. For emergencies, call your local emergency number.</span>
          <span><Link to="/methods">Data &amp; methods</Link> · <Link to="/rules">Community rules</Link></span>
        </div>
      </footer>
    </>
  );
}
