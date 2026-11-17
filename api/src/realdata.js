// Loads REAL Western Cape reference data on first boot from api/data/real
// (produced by scripts/data/fetch_real_data.py). Nothing here is invented:
// anything a source does not contain is stored as "Not recorded" with the reason.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { one, tx } from './db.js';

const DIR = process.env.REAL_DATA_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'real');
const read = (name) => {
  const buf = fs.readFileSync(path.join(DIR, name));
  return JSON.parse((name.endsWith('.gz') ? zlib.gunzipSync(buf) : buf).toString('utf8'));
};
const multi = (g) => JSON.stringify(g.type === 'Polygon' ? { type: 'MultiPolygon', coordinates: [g.coordinates] } : g);
const slugify = (s) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const day = (iso) => (iso || '').slice(0, 10);

const KIND = { A: 'Metropolitan municipality', B: 'Local municipality', C: 'District municipality' };
export const LAW = 'Constitution of the Republic of South Africa, Schedules 4B and 5B; Municipal Structures Act 117 of 1998, s84';
const ESKOM = 'Eskom customer contact centre 08600 37566 (customers supplied directly by Eskom)';
const PROVINCIAL_ROADS = 'Western Cape Government (provincial roads): www.westerncape.gov.za';
const SANRAL = 'SANRAL (national N-routes): www.sanral.co.za';

export function displayName(code, raw, category) {
  if (category === 'A') return raw.startsWith('City of') ? raw : `City of ${raw}`;
  if (category === 'C') return `${raw} District Municipality`;
  return `${raw} Local Municipality`;
}

function channel(m) {
  const parts = [];
  if (m.phone) parts.push(`${m.short} switchboard ${m.phone}`);
  if (m.website) parts.push(m.website.replace(/^https?:\/\//, ''));
  return parts.join(' · ') || 'No contact recorded in the National Treasury register';
}

// Who is legally responsible. Local/metro: Schedules 4B/5B functions sit with the municipality
// (in the Western Cape every local municipality and the City are their own water services authority).
// Districts: s84 district functions; day-to-day services sit with the local municipality.
function responsibilitiesFor(m, locals) {
  const ch = channel(m);
  if (m.category === 'C') {
    const list = locals.map((l) => l.short).join(', ');
    return [
      ['Water and sanitation', ['water', 'sanitation'], `The local municipality where the problem is (${list})`, 'Use the local municipality\'s channel (see its page)'],
      ['Electricity', ['electricity'], `The local municipality in its supply area; Eskom where it supplies customers directly`, `Local municipality, or ${ESKOM}`],
      ['Municipal roads and stormwater', ['roads', 'stormwater'], 'The local municipality where the road is', 'Use the local municipality\'s channel (see its page)'],
      ['Waste collection', ['waste'], 'The local municipality (refuse removal, Schedule 5B)', 'Use the local municipality\'s channel (see its page)'],
      ['Municipal health services', ['other'], `${m.name} (district function, Municipal Structures Act s84(1)(i))`, ch],
      ['Disaster management and district fire services', [], `${m.name} (district function, s84(1)(j))`, ch],
      ['National or provincial roads', [], 'Not the municipality: SANRAL (N-routes) or the Western Cape Government (provincial roads)', `${SANRAL} · ${PROVINCIAL_ROADS}`],
    ];
  }
  return [
    ['Water and sanitation', ['water', 'sanitation'], `${m.name} (water services authority)`, ch],
    ['Electricity', ['electricity'], `${m.name} in its licensed supply area; Eskom where it supplies customers directly`, `${ch} · ${ESKOM}`],
    ['Municipal roads and stormwater', ['roads', 'stormwater'], m.name, ch],
    ['Waste collection', ['waste'], `${m.name} (refuse removal, Schedule 5B)`, ch],
    ['Parks and public spaces', ['public_spaces'], `${m.name} (local amenities, Schedule 5B)`, ch],
    ['National or provincial roads', [], 'Not the municipality: SANRAL (N-routes) or the Western Cape Government (provincial roads)', `${SANRAL} · ${PROVINCIAL_ROADS}`],
  ];
}

export async function loadRealDataIfEmpty() {
  const existing = await one('SELECT count(*)::int AS n FROM municipalities');
  if (existing.n > 0) return;
  console.log(`Loading real reference data from ${DIR} ...`);

  const meta = read('boundaries_meta.json');
  const contacts = read('contacts.json');
  const elections = read('elections.json.gz');
  const pr = read('boundaries_pr.json');
  const dc = read('boundaries_dc.json');
  const mn = read('boundaries_mn.json');
  const wd = read('boundaries_wd.json.gz');

  const geomByCode = Object.fromEntries([...dc, ...mn].map((f) => [f.code, f.geometry]));
  const latest = Object.keys(elections.elections).sort().at(-1);
  const councils2026 = elections.elections[latest].councils;
  const wardsByMuni = wd.reduce((a, w) => ((a[w.municipality_code] ||= []).push(w), a), {});

  await tx(async (t) => {
    for (const f of pr) await t.q('INSERT INTO regions (code, name, geom) VALUES ($1,$2,ST_GeomFromGeoJSON($3))', [f.code, f.name, multi(f.geometry)]);

    const munis = Object.keys(councils2026).map((code) => {
      const c = contacts.items[code] || {};
      const category = c.category || (code.startsWith('DC') ? 'C' : code === 'CPT' ? 'A' : 'B');
      const raw = councils2026[code].name;
      const name = displayName(code, raw, category);
      return {
        code, category, name, short: raw, slug: code === 'CPT' ? 'city-of-cape-town' : slugify(name.replace(/ Local Municipality$/, '')),
        district_code: category === 'B' ? c.parent_code : null, phone: c.phone, website: c.website,
        street_address: c.street_address, postal_address: c.postal_address, province: c.province || 'Western Cape',
      };
    });
    const ids = {};
    for (const m of munis) {
      const wards = wardsByMuni[m.code] || [];
      const row = await t.one(
        `INSERT INTO municipalities (slug, name, province, kind, is_pilot, wards_note, code, category, district_code, phone, website,
                                     street_address, postal_address, ward_count, geom)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14, CASE WHEN $15::text IS NULL THEN NULL ELSE ST_Multi(ST_GeomFromGeoJSON($15)) END)
         RETURNING id`,
        [m.slug, m.name, m.province, KIND[m.category], m.code === 'CPT', m.category === 'C'
          ? 'District council: no wards of its own (60% of seats are seconded from the local councils)'
          : `${wards.length} wards (Municipal Demarcation Board, ${meta.generation})`,
        m.code, m.category, m.district_code, m.phone, m.website, m.street_address, m.postal_address,
        m.category === 'C' ? null : wards.length, geomByCode[m.code] ? JSON.stringify(geomByCode[m.code]) : null]);
      ids[m.code] = row.id;
      m.id = row.id;
      for (const w of wards.sort((a, b) => a.ward_no - b.ward_no)) {
        await t.q(`INSERT INTO wards (municipality_id, code, ward_no, name, suburb, geom) VALUES ($1,$2,$3,$4,NULL,ST_Multi(ST_GeomFromGeoJSON($5)))`,
          [row.id, w.code, w.ward_no, `Ward ${w.ward_no}`, multi(w.geometry)]);
      }
    }

    const fetched = (x) => day(x.fetched_at);
    for (const m of munis) {
      const locals = munis.filter((l) => l.district_code === m.code);
      const rows = responsibilitiesFor(m, locals);
      for (const [i, [service, cats, responsible, ch]] of rows.entries()) {
        await t.q(`INSERT INTO responsibilities (municipality_id, service, categories, responsible, channel, verification, sort)
                   VALUES ($1,$2,$3,$4,$5,$6,$7)`, [m.id, service, cats, responsible, ch, 'Verified: law + official contact register', i + 1]);
      }
      await t.q(`INSERT INTO dataset_sources (municipality_id, dataset, source, url, last_checked, verification) VALUES
          ($1,'responsibilities',$2,$3,$4,'Verified'),
          ($1,'elections',$5,$6,$7,'Official (IEC)'),
          ($1,'council',$8,$6,$7,'Official (IEC) — council as elected')`,
      [m.id, `${LAW}; contact details: ${contacts.source}`, contacts.url, fetched(contacts),
        elections.source, councils2026[m.code].report_url, fetched(elections),
        `IEC seat allocation, ${elections.elections[latest].title}`]);
    }

    // Elections (Dataset A): every year we have, newest first.
    for (const year of Object.keys(elections.elections).sort().reverse()) {
      const E = elections.elections[year];
      for (const [code, c] of Object.entries(E.councils)) {
        if (!ids[code]) continue;
        const el = await t.one(
          `INSERT INTO elections (municipality_id, year, level, is_sample, title, total_valid_votes, seats_total, quota, independents, district_40pct, report_url, printed_on)
           VALUES ($1,$2,$3,false,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
          [ids[code], Number(year), c.district_40pct ? 'District council (directly elected 40%)' : 'Local government elections', E.title,
            c.total_valid_votes, c.seats_total, c.quota, c.independent_ward_councillors || 0, !!c.district_40pct, c.report_url, c.printed_on]);
        for (const [i, p] of c.parties.entries()) {
          await t.q('INSERT INTO election_results (election_id, party, votes, seats, sort) VALUES ($1,$2,$3,$4,$5)', [el.id, p.party, p.votes, p.seats, i + 1]);
        }
      }
    }

    // Council (Dataset B): the council as elected in the latest election. Executive/coalition are
    // decided at the first council sitting and are not in any source we load, so say so.
    const prevYear = Object.keys(elections.elections).sort().at(-2);
    const isoDay = (x) => (x || '').slice(0, 10).replace(/\//g, '-');
    // Latest IEC print date for this election (district reports carry a stale 2016 template date).
    const latestPrinted = Object.values(councils2026).map((c) => isoDay(c.printed_on)).filter((d) => d.startsWith(latest)).sort().at(-1);
    for (const [code, c] of Object.entries(councils2026)) {
      if (!ids[code]) continue;
      const prev = prevYear ? Object.fromEntries((elections.elections[prevYear].councils[code]?.parties || []).map((p) => [p.party, p.seats])) : {};
      const own = isoDay(c.printed_on);
      const asOf = own.startsWith(latest) ? own : latestPrinted;
      const snap = await t.one(
        `INSERT INTO council_snapshots (municipality_id, as_of, verification, arrangement_type, executive_mayor, effective_from, source)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [ids[code], asOf, 'Official (IEC) — council as elected',
          'Not recorded yet — the governing arrangement is settled at the first council sitting after the election',
          'Not recorded yet — elected by the new council at its first sitting',
          `Seats allocated by the IEC after the ${elections.elections[latest].title}`,
          `IEC Seat Calculation Detail (${c.report_url})`]);
      const seated = c.parties.filter((p) => p.seats > 0);
      for (const [i, p] of seated.entries()) {
        await t.q('INSERT INTO council_seats (snapshot_id, party, seats_now, change, sort) VALUES ($1,$2,$3,$4,$5)',
          [snap.id, p.party, p.seats, p.seats - (prev[p.party] || 0), i + 1]);
      }
      if (c.independent_ward_councillors) {
        await t.q('INSERT INTO council_seats (snapshot_id, party, seats_now, change, sort) VALUES ($1,$2,$3,0,$4)',
          [snap.id, 'Independent ward councillors', c.independent_ward_councillors, seated.length + 1]);
      }
    }

    for (const [dataset, src] of [['boundaries', meta], ['contacts', contacts], ['elections', elections]]) {
      await t.q('INSERT INTO data_imports (dataset, source, url, fetched_at, detail) VALUES ($1,$2,$3,$4,$5)',
        [dataset, src.source, src.url, src.fetched_at, JSON.stringify(dataset === 'boundaries' ? { generation: meta.generation, counts: meta.counts, province: meta.province } : {})]);
    }
  });
  console.log('Real reference data loaded.');
}
