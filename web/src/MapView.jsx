import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { STATUS_HEX } from './components.jsx';

const CENTER = [-33.4, 20.8];
const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

function baseMap(el, opts = {}) {
  const map = L.map(el, { zoomControl: true, scrollWheelZoom: false, ...opts }).setView(opts.center || CENTER, opts.zoom || 7);
  L.tileLayer(TILE_URL, { attribution: ATTRIBUTION, maxZoom: 19, className: 'cw-tiles' }).addTo(map);
  return map;
}

const pinIcon = (status, big) => L.divIcon({
  className: '', iconSize: big ? [22, 22] : [16, 16],
  html: `<div class="pin" style="background:${STATUS_HEX[status] || '#1f7a72'};${big ? 'width:22px;height:22px' : ''}"></div>`,
});

/** Map of reports with simple pixel-grid clustering. */
export function ReportsMap({ reports, onSelect, className = 'map', wards }) {
  const el = useRef();
  const mapRef = useRef();
  const layer = useRef();

  useEffect(() => {
    const map = baseMap(el.current);
    mapRef.current = map;
    layer.current = L.layerGroup().addTo(map);
    return () => map.remove();
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !wards) return;
    const g = L.geoJSON({ type: 'FeatureCollection', features: wards.map((w) => ({ type: 'Feature', geometry: w.geometry, properties: w })) }, {
      style: { color: '#0e5550', weight: 1, opacity: .45, fillOpacity: .03, dashArray: '4 4' },
      onEachFeature: (f, l) => l.bindTooltip(`${f.properties.name} · ${f.properties.suburb}`, { sticky: true }),
    }).addTo(map);
    return () => g.remove();
  }, [wards]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const draw = () => {
      layer.current.clearLayers();
      const cell = 56;
      const buckets = new Map();
      for (const r of reports) {
        const p = map.project([r.lat, r.lng], map.getZoom());
        const key = `${Math.floor(p.x / cell)}:${Math.floor(p.y / cell)}`;
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key).push(r);
      }
      for (const group of buckets.values()) {
        if (group.length === 1) {
          const r = group[0];
          L.marker([r.lat, r.lng], { icon: pinIcon(r.status), title: r.title, keyboard: true })
            .bindPopup(`<strong>${escapeHtml(r.title)}</strong><br><span style="color:#5d6b69">${escapeHtml(r.status_label)} · ${escapeHtml([r.municipality, r.ward].filter(Boolean).join(', '))}</span><br><a href="/reports/${r.id}">Open report</a>`)
            .on('click', () => onSelect?.(r))
            .addTo(layer.current);
        } else {
          const lat = group.reduce((s, r) => s + r.lat, 0) / group.length;
          const lng = group.reduce((s, r) => s + r.lng, 0) / group.length;
          L.marker([lat, lng], {
            icon: L.divIcon({ className: '', iconSize: [34, 34], html: `<div class="cluster">${group.length}</div>` }),
            title: `${group.length} reports`,
          }).on('click', () => map.fitBounds(L.latLngBounds(group.map((r) => [r.lat, r.lng])).pad(0.3)))
            .addTo(layer.current);
        }
      }
    };
    draw();
    map.on('zoomend', draw);
    return () => map.off('zoomend', draw);
  }, [reports, onSelect]);

  return (
    <div className={className} style={{ position: 'relative' }}>
      <div ref={el} style={{ position: 'absolute', inset: 0 }} />
      <div className="map-legend" aria-label="Map legend">
        <b>Pin colour = status</b>
        <span className="legend-item"><i style={{ background: STATUS_HEX.resolved }} />Resolved</span>
        <span className="legend-item"><i style={{ background: STATUS_HEX.acknowledged }} />Open</span>
        <span className="legend-item"><i style={{ background: STATUS_HEX.reopened }} />Reopened</span>
        <span className="legend-item"><i style={{ background: STATUS_HEX.needs_info }} />Needs info</span>
      </div>
    </div>
  );
}

/** Single (optionally draggable) pin. */
export function PinMap({ lat, lng, status, onMove, className = 'map sm', reduced }) {
  const el = useRef();
  const mapRef = useRef();
  const marker = useRef();
  const circle = useRef();

  useEffect(() => {
    const map = baseMap(el.current, { center: lat != null ? [lat, lng] : CENTER, zoom: lat != null ? 15 : 12 });
    mapRef.current = map;
    if (onMove) map.on('click', (e) => onMove(e.latlng.lat, e.latlng.lng));
    return () => map.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    marker.current?.remove(); circle.current?.remove();
    if (lat == null) return;
    if (reduced) {
      circle.current = L.circle([lat, lng], { radius: 700, color: '#0e5550', weight: 1, fillOpacity: .12 }).addTo(map);
    } else {
      marker.current = L.marker([lat, lng], { icon: pinIcon(status || 'submitted', true), draggable: !!onMove }).addTo(map);
      if (onMove) marker.current.on('dragend', (e) => { const p = e.target.getLatLng(); onMove(p.lat, p.lng); });
    }
    if (!map.getBounds().contains([lat, lng])) map.setView([lat, lng], Math.max(map.getZoom(), 15));
  }, [lat, lng, status, reduced, onMove]);

  return <div ref={el} className={className} />;
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------- Real boundaries (MDB) painted by magnitude ----------
// Sequential single-hue ramp (light = few, dark = many). Areas are never coloured by party.
export const SEQ = ['#cde2fb', '#9ec5f4', '#5598e7', '#256abf', '#0d366b'];
export const SEQ_ZERO = '#eef1f4';
const METRICS = {
  reports: { label: 'Reports', value: (p) => p.reports },
  open: { label: 'Open reports', value: (p) => p.open },
  resolved_pct: { label: 'Share resolved', value: (p) => (p.reports ? Math.round((p.resolved / p.reports) * 100) : null), pct: true },
};
function bins(values, pct) {
  if (pct) return [20, 40, 60, 80];
  const v = values.filter((x) => x > 0).sort((a, b) => a - b);
  if (!v.length) return [1, 2, 3, 4];
  const qn = (f) => v[Math.min(v.length - 1, Math.floor(f * v.length))];
  const b = [qn(0.2), qn(0.4), qn(0.6), qn(0.8)];
  for (let i = 1; i < b.length; i++) if (b[i] <= b[i - 1]) b[i] = b[i - 1] + 1;
  return b;
}
function ranges(b, pct) {
  if (pct) return [`< ${b[0]}%`, `${b[0]}–${b[1] - 1}%`, `${b[1]}–${b[2] - 1}%`, `${b[2]}–${b[3] - 1}%`, `${b[3]}%+`];
  const lo = [1, ...b];
  return lo.map((l, i) => {
    if (i === lo.length - 1) return `${l}+`;
    const h = lo[i + 1] - 1;
    return h < l ? null : h === l ? `${l}` : `${l}–${h}`;
  });
}
const fillFor = (val, b) => (val == null || val === 0 ? SEQ_ZERO : SEQ[b.filter((t) => val >= t).length]);

/** Western Cape map: municipalities painted by a metric; click one to drill into its real wards. */
const NO_REPORTS = [];
export function AreaMap({ focus = null, metric = 'reports', onFocus, className = 'map tall', showPins = false, reports = NO_REPORTS }) {
  const el = useRef();
  const onFocusRef = useRef(onFocus);
  onFocusRef.current = onFocus;
  const mapRef = useRef();
  const layers = useRef({});
  const [geo, setGeo] = useState(null);
  const [wards, setWards] = useState(null);
  const [legend, setLegend] = useState(null);
  const [current, setCurrent] = useState(focus);

  useEffect(() => { setCurrent(focus); }, [focus]);
  useEffect(() => {
    const map = baseMap(el.current, { center: [-33.4, 20.8], zoom: 6 });
    mapRef.current = map;
    const ro = new ResizeObserver(() => { map.invalidateSize(); if (layers.current.fit) map.fitBounds(layers.current.fit, { padding: [12, 12], animate: false }); });
    ro.observe(el.current);
    Promise.all([fetch('/api/geo/region').then((r) => r.json()), fetch('/api/geo/municipalities').then((r) => r.json()),
      fetch('/api/geo/municipalities?category=C').then((r) => r.json())]).then(([region, munis, districts]) => setGeo({ region, munis, districts }));
    return () => { ro.disconnect(); map.remove(); };
  }, []);
  useEffect(() => {
    if (!current) { setWards(null); return; }
    fetch(`/api/geo/wards?municipality=${encodeURIComponent(current)}`).then((r) => r.json()).then(setWards);
  }, [current]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !geo) return;
    Object.entries(layers.current).forEach(([k, l]) => k !== 'fit' && l.remove());
    layers.current = {};
    const M = METRICS[metric] || METRICS.reports;
    const region = L.geoJSON(geo.region, { style: { color: '#0b2a33', weight: 2, fill: false }, interactive: false }).addTo(map);
    layers.current.region = region;
    const target = wards ? wards.features : geo.munis.features;
    const b = bins(target.map((f) => M.value(f.properties)), M.pct);
    setLegend({ label: `${M.label} per ${wards ? 'ward' : 'municipality'}`, b, pct: M.pct });
    const tip = (p) => {
      const v = M.value(p);
      return `<strong>${escapeHtml(p.name)}</strong>${p.district ? `<br><span style="color:#5d6b69">${escapeHtml(p.district)}</span>` : ''}`
        + `<br>${p.reports} reports · ${p.open} open · ${p.resolved} resolved`
        + (M.pct ? `<br>${v == null ? 'No reports' : `${v}% resolved`}` : '')
        + (p.demo_party ? `<br><span style="color:#5d6b69">Demo ward holder: ${escapeHtml(p.demo_party)}</span>` : '');
    };
    const areas = L.geoJSON({ type: 'FeatureCollection', features: geo.munis.features }, {
      style: (f) => ({ color: '#ffffff', weight: 1, fillColor: wards ? '#e8ebee' : fillFor(M.value(f.properties), b), fillOpacity: wards ? 0.5 : 0.85 }),
      onEachFeature: (f, l) => {
        l.bindTooltip(tip(f.properties), { sticky: true });
        l.on('click', () => { setCurrent(f.properties.slug); onFocusRef.current?.(f.properties); });
      },
    }).addTo(map);
    layers.current.areas = areas;
    layers.current.districts = L.geoJSON(geo.districts, { style: { color: '#0b2a33', weight: 1.5, dashArray: '5 4', fill: false }, interactive: false }).addTo(map);
    if (wards) {
      const w = L.geoJSON(wards, {
        style: (f) => ({ color: '#ffffff', weight: 1, fillColor: fillFor(M.value(f.properties), b), fillOpacity: 0.85 }),
        onEachFeature: (f, l) => l.bindTooltip(tip({ ...f.properties, name: `${wards.municipality.name} · ${f.properties.name}` }), { sticky: true }),
      }).addTo(map);
      layers.current.wards = w;
    }
    const fit = (wards ? layers.current.wards : region).getBounds();
    layers.current.fit = fit;
    map.invalidateSize();
    map.fitBounds(fit, { padding: [12, 12], animate: false });
    if (showPins && reports.length) {
      layers.current.pins = L.layerGroup(reports.map((r) => L.marker([r.lat, r.lng], { icon: pinIcon(r.status), title: r.title })
        .bindPopup(`<strong>${escapeHtml(r.title)}</strong><br><a href="/reports/${r.id}">Open report</a>`))).addTo(map);
    }
  }, [geo, wards, metric, showPins, reports]);

  return (
    <div className={className} style={{ position: 'relative' }}>
      <div ref={el} style={{ position: 'absolute', inset: 0 }} />
      {current && !focus && (
        <button className="btn btn-sm map-back" onClick={() => { setCurrent(null); onFocusRef.current?.(null); }}>← All of the Western Cape</button>
      )}
      {legend && (
        <div className={`map-legend seq ${/\bmd\b/.test(className) ? 'compact' : ''}`} aria-label="Map legend">
          <b>{legend.label}</b>
          <div className="seq-scale">
            <span className="legend-item"><i style={{ background: SEQ_ZERO }} />{legend.pct ? 'None' : '0'}</span>
            {ranges(legend.b, legend.pct).map((label, i) => label && (
              <span key={SEQ[i]} className="legend-item"><i style={{ background: SEQ[i] }} />{label}</span>
            ))}
          </div>
          {!/\bmd\b/.test(className) && <span className="xs muted">Dashed lines: district boundaries. Source: MDB via OpenUp MapIt.</span>}
        </div>
      )}
    </div>
  );
}
