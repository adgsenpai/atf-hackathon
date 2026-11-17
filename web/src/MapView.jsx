import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { STATUS_HEX } from './components.jsx';

const CENTER = [-33.97, 18.50];
const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

function baseMap(el, opts = {}) {
  const map = L.map(el, { zoomControl: true, scrollWheelZoom: false, ...opts }).setView(opts.center || CENTER, opts.zoom || 12);
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
            .bindPopup(`<strong>${escapeHtml(r.title)}</strong><br><span style="color:#5d6b69">${escapeHtml(r.status_label)} · ${escapeHtml(r.suburb || '')}</span><br><a href="/reports/${r.id}">Open report</a>`)
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
