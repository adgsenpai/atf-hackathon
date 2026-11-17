import { createContext, useContext, useEffect, useState } from 'react';
import { api, getToken, setToken } from './api.js';

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!getToken()) { setReady(true); return; }
    api('/auth/me').then(setUser).catch(() => setToken(null)).finally(() => setReady(true));
  }, []);

  const signIn = async (email, password, register = false) => {
    const res = await api(register ? '/auth/register' : '/auth/login', { method: 'POST', body: { email, password } });
    setToken(res.token);
    setUser(res.user);
    return res.user;
  };
  const signOut = () => { setToken(null); setUser(null); };
  const isMod = user && (user.role === 'moderator' || user.role === 'admin');

  return <AuthCtx.Provider value={{ user, ready, signIn, signOut, isMod }}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);
