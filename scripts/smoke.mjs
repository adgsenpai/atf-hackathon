// End-to-end API smoke tests. Usage: node scripts/smoke.mjs [baseUrl]
// Default base: http://localhost:8088 (through nginx). Requires a freshly seeded stack for some counts.
const BASE = process.argv[2] || process.env.BASE_URL || 'http://localhost:8088';
let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) failures++; };

async function api(path, { token, method = 'GET', body, raw } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { ...(body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
  });
  const data = raw ? await res.text() : await res.json().catch(() => null);
  return { status: res.status, data };
}
const login = async (email) => (await api('/api/auth/login', { method: 'POST', body: { email, password: 'civicwatch' } })).data.token;

const health = await api('/api/health');
ok(health.status === 200, 'health endpoint');

const list = await api('/api/reports?category=roads&limit=100');
ok(list.status === 200 && list.data.items.every((r) => r.category === 'roads'), 'list filters by category');
ok(list.data.items.every((r) => r.status !== 'duplicate'), 'merged duplicates hidden from list');

const sensitive = (await api('/api/reports?limit=500')).data.items.filter((r) => r.sensitive);
ok(sensitive.every((r) => r.street === null && Math.abs(r.lat * 100 - Math.round(r.lat * 100)) < 1e-9), 'sensitive reports are coarsened for visitors');

const resident = await login('resident@example.org');
const official = await login('official@example.org');
const moderator = await login('moderator@example.org');
const admin = await login('admin@example.org');
ok(resident && official && moderator && admin, 'demo accounts can sign in');

const geo = await api('/api/geo/lookup?lat=-33.95&lng=18.46');
ok(/^Ward \d+$/.test(geo.data.ward) && geo.data.municipality === 'City of Cape Town', 'PostGIS ward lookup inside real boundary');
const geoOut = await api('/api/geo/lookup?lat=-33.5&lng=18.0');
ok(geoOut.data.ward === null, 'ward lookup outside boundary returns not found');

const pii = await api('/api/reports', { token: resident, method: 'POST', body: { category: 'roads', title: 'Test pothole', description: 'Call me on 082 123 4567 please', lat: -33.95, lng: 18.46, observed_on: '2026-11-01' } });
ok(pii.status === 400, 'phone numbers rejected in description');

const created = await api('/api/reports', { token: resident, method: 'POST', body: { category: 'roads', title: 'Smoke test pothole', description: 'A smoke-test report describing a pothole.', street: 'Test Street', lat: -33.95, lng: 18.46, observed_on: '2026-11-10' } });
ok(created.status === 201 && created.data.ward === geo.data.ward, 'resident creates report with ward from pin');
const id = created.data.id;

// photo with EXIF: minimal JPEG with an APP1 Exif segment
const jpeg = Buffer.from('ffd8' + 'ffe000084a4649460001' + 'ffe1000a4578696600004d4d' + 'ffda00020011' + 'ffd9', 'hex');
const fd = new FormData();
fd.append('photos', new Blob([jpeg], { type: 'image/jpeg' }), 'p.jpg');
const up = await api(`/api/reports/${id}/photos`, { token: resident, method: 'POST', body: fd });
ok(up.status === 201, 'photo upload accepted');
if (up.status === 201) {
  const img = Buffer.from(await (await fetch(BASE + up.data[0].path)).arrayBuffer());
  ok(!img.includes(Buffer.from('Exif')), 'EXIF stripped from stored photo');
}

const prop = await api(`/api/reports/${id}/status`, { token: resident, method: 'POST', body: { status: 'acknowledged', note: 'Got a reference number', evidence: 'SMS' } });
ok(prop.status === 201 && prop.data.state === 'pending', 'community status change goes to moderation');
const off = await api(`/api/reports/${id}/status`, { token: official, method: 'POST', body: { status: 'in_progress', reference: 'REF-TEST' } });
ok(off.status === 201 && off.data.source === 'official' && off.data.state === 'approved', 'verified official sets status directly');
const detail = await api(`/api/reports/${id}`);
ok(detail.data.status === 'in_progress' && detail.data.status_source === 'official', 'detail shows official status');

const c = await api(`/api/reports/${id}/comments`, { token: resident, method: 'POST', body: { body: 'Smoke comment' } });
ok(c.status === 201, 'comment posted');
const f = await api('/api/flags', { token: official, method: 'POST', body: { target_type: 'comment', target_id: c.data.id, reason: 'spam' } });
ok(f.status === 201, 'flag created');

const queue = await api('/api/mod/queue', { token: moderator });
ok(queue.status === 200 && queue.data.some((x) => x.key === `comment:${c.data.id}`), 'flag appears in moderation queue');
ok((await api('/api/mod/queue', { token: resident })).status === 403, 'queue forbidden to residents');
const noReason = await api('/api/mod/decide', { token: moderator, method: 'POST', body: { target_type: 'comment', target_id: c.data.id, action: 'remove' } });
ok(noReason.status === 400, 'decision without reason code rejected');
const dec = await api('/api/mod/decide', { token: moderator, method: 'POST', body: { target_type: 'comment', target_id: c.data.id, action: 'remove', reason_code: 'spam', note: 'test' } });
ok(dec.status === 200, 'moderator removes comment');
const audit = await api('/api/mod/audit', { token: moderator });
ok(audit.data[0].id === dec.data.action.id && audit.data[0].before.state === 'visible' && audit.data[0].after.state === 'removed', 'audit log has before/after');

const appeal = await api('/api/appeals', { token: resident, method: 'POST', body: { action_id: dec.data.action.id, reason: 'This was not spam, it was a real update.' } });
ok(appeal.status === 201, 'author can appeal');
const appeals = (await api('/api/mod/appeals', { token: moderator })).data;
const mine = appeals.find((a) => a.action_id === dec.data.action.id);
const self = await api(`/api/mod/appeals/${mine.id}/decide`, { token: moderator, method: 'POST', body: { outcome: 'overturned', note: 'x' } });
ok(self.status === 403, 'original moderator cannot decide the appeal');
const other = await api(`/api/mod/appeals/${mine.id}/decide`, { token: admin, method: 'POST', body: { outcome: 'overturned', note: 'Restored after review.' } });
ok(other.status === 200, 'different reviewer decides appeal');
const comments = (await api(`/api/reports/${id}/comments`)).data;
ok(comments.find((x) => x.id === c.data.id)?.state === 'visible', 'overturned appeal restores comment');

const el = await api('/api/municipalities/city-of-cape-town/elections');
const co = await api('/api/municipalities/city-of-cape-town/council');
ok(el.data.results.length > 0 && !('seats_now' in el.data.results[0]), 'election results are a separate dataset');
ok(co.data.seats.length > 0 && co.data.rule.includes('never inferred'), 'council snapshot is separate with rule');

const perf = await api('/api/municipalities/city-of-cape-town/performance');
ok(perf.data.metrics.length === 6 && perf.data.metrics.every((m) => m.period && m.method && m.source && m.verification), 'every metric has period/method/source/verification');
ok(!JSON.stringify(perf.data).toLowerCase().includes('score'), 'no score in performance output');
const csv = await api('/api/municipalities/city-of-cape-town/performance.csv', { raw: true });
ok(csv.status === 200 && csv.data.includes('ref,category,ward'), 'CSV export');

const iecHealth = await fetch(BASE + '/iec/health').then((r) => r.text()).catch(() => '');
ok(iecHealth.trim() === 'ok', 'Rust IEC API reachable through nginx');
const parties = await api('/iec/api/parties?limit=3');
ok(parties.status === 200, 'IEC parties list');

// Real IEC party registry through the civic API
const pMeta = await api('/api/parties/meta');
ok(pMeta.status === 200 && pMeta.data.count > 100 && pMeta.data.url?.includes('elections.org.za') && pMeta.data.scraped_at, 'party registry meta exposes IEC source + scrape date');
const pList = await api('/api/parties?q=democratic&level=National&limit=5');
ok(pList.status === 200 && pList.data.items.length > 0 && pList.data.items.every((x) => x.levels.includes('National')), 'party list filters by level');
ok(pList.data.items.every((x) => !('votes' in x) && !('seats' in x)), 'party registry never carries votes/seats');
const withLogo = (await api('/api/parties?has_logo=true&limit=1')).data.items[0];
ok(withLogo?.logo?.startsWith('/iec/logos/'), 'party logos are served through /iec');
const logo = await fetch(BASE + withLogo.logo);
ok(logo.status === 200 && (logo.headers.get('content-type') || '').startsWith('image/'), 'party logo image loads');
const one = await api(`/api/parties/${withLogo.id}`);
ok(one.status === 200 && one.data.id === withLogo.id && one.data.source?.url, 'party detail with source');
ok((await api('/api/parties/no-such-party-xyz')).status === 404, 'unknown party is 404');
ok((await api('/api/parties?level=Galactic')).status === 400, 'invalid level is 400');

const mParties = await api('/api/municipalities/city-of-cape-town/parties');
ok(mParties.status === 200 && mParties.data.level === 'Metro' && mParties.data.items.length === mParties.data.total && mParties.data.items.every((x) => x.levels.includes('Metro')), 'municipality lists Metro-level IEC parties');
ok(mParties.data.items.some((x) => x.local_address) && mParties.data.note && mParties.data.source?.scraped_at, 'municipality parties flag local addresses and cite source');
ok(mParties.data.items.every((x) => !('votes' in x) && !('seats' in x)), 'municipality party list has no votes/seats');

const spa = await fetch(BASE + '/parties/democratic-alliance-da');
ok(spa.status === 200 && (await spa.text()).includes('<div id="root">'), 'party detail route served by SPA');

const elx = (await api('/api/municipalities/city-of-cape-town/elections')).data;
ok(elx.results.every((x) => 'registry' in x) && elx.results.filter((x) => /sample/i.test(x.party)).every((x) => x.registry === null), 'sample result rows are never linked to a real party');
const cx = (await api('/api/municipalities/city-of-cape-town/council')).data;
ok(cx.seats.every((x) => 'registry' in x && (!/sample/i.test(x.party) || x.registry === null)), 'council rows carry registry link only for real names');

// ---------- P5: real Western Cape data ----------
const st = (await api('/api/stats')).data;
ok(st.councils === 30 && st.municipalities === 25 && st.wards === 406, 'real WC data: 30 councils, 25 municipalities, 406 wards');
ok(st.latest_election === 2026 && st.sources.length === 3, 'stats expose latest election and 3 data sources');
const munis = (await api('/api/municipalities')).data;
ok(munis.every((m) => m.code && m.kind && !('geom' in m)) && munis.filter((m) => m.category === 'C').length === 5, 'municipality list is real and geometry-free');
const cptEl = (await api('/api/municipalities/city-of-cape-town/elections?year=2026')).data;
ok(cptEl.election.seats_total === 235 && !cptEl.election.is_sample && cptEl.results.reduce((a, x) => a + x.seats, 0) === 235, 'CPT 2026: 235 seats from IEC, seats add up');
ok(cptEl.results.some((x) => x.registry), 'real result rows link to the IEC party register');
const dc = (await api('/api/municipalities/west-coast-district-municipality/elections')).data;
ok(dc.election?.district_40pct === true, 'district council flagged as directly elected 40%');
const gm = (await api('/api/geo/municipalities')).data;
ok(gm.type === 'FeatureCollection' && gm.features.length === 25 && gm.features.every((f) => f.geometry), 'geo: 25 municipal areas with geometry');
const gw = (await api('/api/geo/wards?municipality=city-of-cape-town')).data;
ok(gw.features.length === 116, 'geo: 116 real Cape Town wards');
const acc = (await api('/api/municipalities/city-of-cape-town/accountability')).data;
const names = acc.items.map((x) => x.party);
ok(acc.demo === true && acc.items.length === 5 && names.every((x) => x.endsWith('(demo)')) && names.join() === [...names].sort((a, b) => a.localeCompare(b)).join(), 'accountability: 5 fictional demo parties, alphabetical');
ok(acc.items.every((x) => !('score' in x) && !('rank' in x)), 'accountability: no score or rank');
const wardSpread = acc.items.map((x) => x.wards);
ok(Math.max(...wardSpread) - Math.min(...wardSpread) <= 1, 'accountability: wards shared equally between demo parties');
const resp = (await api('/api/municipalities/city-of-cape-town')).data;
ok(resp.responsibilities.length >= 6 && resp.phone && resp.website, 'responsibilities and Treasury contacts loaded');
let placeholders = 0;
for (const u of ['/api/municipalities/city-of-cape-town', '/api/municipalities/city-of-cape-town/council', '/api/municipalities/city-of-cape-town/elections',
  '/api/municipalities/city-of-cape-town/performance', '/api/reports?limit=500', '/api/municipalities/west-coast-district-municipality']) {
  const t = await (await fetch(BASE + u)).text();
  placeholders += (t.match(/\[(?:to |[A-Z][a-z]+[ ,\]]|[a-z]+ [a-z]+)[^\]"]{0,60}\]/g) || []).length;
}
ok(placeholders === 0, `no "[...]" placeholders in API responses (${placeholders} found)`);

console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
