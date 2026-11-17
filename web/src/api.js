const TOKEN_KEY = 'cw_token';

export const getToken = () => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } };
export const setToken = (t) => { try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ } };

export async function api(path, { method = 'GET', body } = {}) {
  const token = getToken();
  const isForm = body instanceof FormData;
  const res = await fetch(`/api${path}`, {
    method,
    headers: {
      ...(body && !isForm ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: isForm ? body : body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.fields = data.fields;
    throw err;
  }
  return data;
}

export const qs = (o) => {
  const p = new URLSearchParams();
  Object.entries(o).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '' && v !== 'all') p.set(k, v); });
  const s = p.toString();
  return s ? `?${s}` : '';
};

export const fmtDate = (d) => new Date(d.length === 10 ? `${d}T00:00:00` : d)
  .toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });
export const fmtDateTime = (d) => {
  const x = new Date(d);
  return `${fmtDate(d)}, ${x.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit', hour12: false })}`;
};
export const ago = (d) => {
  const h = (Date.now() - new Date(d)) / 3600e3;
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} min ago`;
  if (h < 24) return `${Math.round(h)} h ago`;
  const days = Math.round(h / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
};
