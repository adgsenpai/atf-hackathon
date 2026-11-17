// Seeds DEMO activity (users, reports, comments, moderation) on first boot when there are no users.
// Reference data (municipalities, wards, results, council) is real and loaded by realdata.js first.
// Demo reports are placed at points in the City of Cape Town and assigned to the real ward by PostGIS.
import { one, tx } from './db.js';
import { hashPassword } from './auth.js';

function rng(seed) { // mulberry32
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(20261117);
const pick = (a) => a[Math.floor(rand() * a.length)];
const DAY = 864e5;
// Fictional demo parties (checked: none of these names exist in the IEC register).
export const DEMO_PARTIES = ['Fynbos Civic Party (demo)', 'Harbour Unity Movement (demo)', 'Kestrel Progressive Alliance (demo)',
  'Milkwood Residents Association (demo)', "Sunbird People's Front (demo)"];

const TEMPLATES = {
  water: ['Burst pipe flooding the pavement', 'No water supply since yesterday', 'Leaking fire hydrant', 'Low water pressure in the whole street', 'Water meter leaking at the kerb'],
  electricity: ['Streetlight out on the corner', 'Several streetlights flickering', 'Exposed cable at substation fence', 'Power outage affecting the block'],
  roads: ['Pothole near the traffic circle', 'Faded pedestrian crossing markings', 'Broken kerb at bus stop', 'Damaged speed hump', 'Missing road sign at intersection'],
  sanitation: ['Sewage overflow from manhole', 'Blocked public toilet', 'Sewer smell near the clinic'],
  waste: ['Bins not collected this week', 'Illegal dumping on open plot', 'Overflowing public bin at taxi rank'],
  stormwater: ['Blocked storm drain', 'Stormwater channel full of litter', 'Flooding at low point after rain'],
  public_spaces: ['Broken swings at the playground', 'Overgrown grass in the park', 'Damaged bench and broken lighting in the park'],
  other: ['Abandoned vehicle on verge', 'Graffiti on community hall'],
};
const STREETS = ['Protea Road', 'Fynbos Avenue', 'Harbour Street', 'Kloof Lane', 'River Road', 'Milkwood Close', 'Acacia Crescent', 'Station Road', 'Church Street', 'Main Road'];
const WARD_BOXES = [ // [latTop, lngLeft] for each 0.04-degree sample ward S01..S06
  [-33.93, 18.44], [-33.93, 18.48], [-33.93, 18.52], [-33.97, 18.44], [-33.97, 18.48], [-33.97, 18.52],
];

export async function seedIfEmpty() {
  const existing = await one('SELECT count(*) FROM users');
  if (existing.count > 0) return;
  console.log('Seeding demo activity...');
  const pw = hashPassword('civicwatch');
  const now = Date.now();

  await tx(async (t) => {
    const user = (email, pseudonym, role, extra = {}) => t.one(
      `INSERT INTO users (email, password_hash, pseudonym, role, municipality_id, verified, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [email, pw, pseudonym, role, extra.municipality_id ?? null, !!extra.verified, extra.created_at ?? new Date(now - 200 * DAY)]);

    const resident = await user('resident@example.org', 'Resident 482', 'resident');
    const cpt = await t.one("SELECT id FROM municipalities WHERE code='CPT'");
    const official = await user('official@example.org', 'City of Cape Town representative (demo account)', 'official', { municipality_id: cpt.id, verified: true });
    const moderator = await user('moderator@example.org', 'Moderator 1', 'moderator');
    await user('admin@example.org', 'Senior moderator', 'admin');
    const r107 = await user('resident107@sample.invalid', 'Resident 107', 'resident');
    const r219 = await user('resident219@sample.invalid', 'Resident 219', 'resident', { created_at: new Date(now - 3 * DAY) });
    const crowd = [];
    for (let i = 0; i < 40; i++) crowd.push(await user(`resident${500 + i}@sample.invalid`, `Resident ${500 + i}`, 'resident'));

    async function report({ author, category, title, description, street, ward, observed, created, sensitive = false, lat, lng, municipality_id }) {
      const box = WARD_BOXES[ward];
      const la = lat ?? box[0] - 0.005 - rand() * 0.03;
      const ln = lng ?? box[1] + 0.005 + rand() * 0.03;
      const geo = await t.one(
        `SELECT (SELECT id FROM wards w WHERE ST_Contains(w.geom, ST_SetSRID(ST_Point($2,$1),4326)) LIMIT 1) AS ward_id`, [la, ln]);
      return t.one(
        `INSERT INTO reports (author_id, municipality_id, ward_id, category, title, description, street, lat, lng, sensitive, observed_on, created_at, is_sample)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,true) RETURNING *`,
        [author.id, municipality_id ?? cpt.id, geo.ward_id, category, title, description, street, la, ln, sensitive, observed, created]);
    }
    async function event(rep, status, source, by, kind, at, extra = {}) {
      await t.q(
        `INSERT INTO status_events (report_id, status, source, recorded_by, recorder_kind, note, evidence, reference, state, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [rep.id, status, source, by.id, kind, extra.note ?? null, extra.evidence ?? null, extra.reference ?? null, extra.state ?? 'approved', at]);
      if ((extra.state ?? 'approved') === 'approved')
        await t.q('UPDATE reports SET status=$2, status_source=$3, status_changed_at=$4 WHERE id=$1', [rep.id, status, source, at]);
    }
    const follow = async (rep, n) => {
      for (const u of crowd.slice(0, n)) await t.q('INSERT INTO follows VALUES ($1,$2) ON CONFLICT DO NOTHING', [u.id, rep.id]);
    };
    const comment = (rep, u, body, at, extra = {}) => t.one(
      `INSERT INTO comments (report_id, parent_id, user_id, body, is_official, state, removed_rule, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [rep.id, extra.parent_id ?? null, u.id, body, !!extra.official, extra.state ?? 'visible', extra.removed_rule ?? null, at]);
    const flag = (type, id, u, reason, at) => t.q(
      'INSERT INTO flags (target_type, target_id, user_id, reason, created_at) VALUES ($1,$2,$3,$4,$5)', [type, id, u.id, reason, at]);
    const d = (s) => new Date(s);

    // ---- The five reports from the mockups ----
    const pothole = await report({
      author: resident, category: 'roads', title: 'Deep pothole in the left lane, Protea Road', street: 'Protea Road', ward: 0,
      description: 'Deep pothole in the left lane. Cars swerve into the right lane to avoid it, especially near the school gate in the morning.',
      observed: '2026-11-12', created: d('2026-11-12T08:14:00+02:00'), lat: -33.9452, lng: 18.4631,
    });
    await event(pothole, 'submitted', 'user_reported', resident, 'author', d('2026-11-12T08:14:00+02:00'));
    await event(pothole, 'acknowledged', 'user_reported', r107, 'community', d('2026-11-13T10:02:00+02:00'),
      { note: 'Received an automated reply from the call centre with a reference number.', evidence: 'Screenshot attached.' });
    await event(pothole, 'in_progress', 'official', official, 'official', d('2026-11-15T14:30:00+02:00'),
      { reference: 'DEMO-1001', note: 'Demo official update: crew scheduled. Reference DEMO-1001.' });
    await t.q(`INSERT INTO report_photos (report_id, user_id, path, kind, created_at) VALUES
      ($1,$2,NULL,'author','2026-11-12T08:20:00+02:00'), ($1,$3,NULL,'community','2026-11-13T09:00:00+02:00'), ($1,$4,NULL,'community','2026-11-15T07:30:00+02:00')`,
      [pothole.id, resident.id, r107.id, crowd[0].id]);
    await follow(pothole, 13);
    await t.q('INSERT INTO follows VALUES ($1,$2) ON CONFLICT DO NOTHING', [resident.id, pothole.id]);
    const c1 = await comment(pothole, resident, 'Confirmed. It is getting wider. A tyre was damaged on Tuesday.', d('2026-11-13T12:00:00+02:00'));
    for (const u of crowd.slice(0, 6)) await t.q('INSERT INTO comment_votes VALUES ($1,$2)', [u.id, c1.id]);
    await comment(pothole, r107, 'Added a photo of the other lane. The edge of the surface is breaking away.', d('2026-11-14T08:00:00+02:00'), { parent_id: c1.id });
    const removed = await comment(pothole, resident,'Demo comment that named a person and accused them without a source.', d('2026-11-14T10:00:00+02:00'),
      { state: 'removed', removed_rule: 'Unsupported personal accusation' });
    await t.q(`INSERT INTO moderation_actions (moderator_id, target_type, target_id, action, reason_code, note, before, after, created_at)
               VALUES ($1,'comment',$2,'remove','personal_accusation','Comment named a person without a source.',$3,$4,'2026-11-14T11:00:00+02:00')`,
      [moderator.id, removed.id, JSON.stringify({ ...removed, state: 'visible', removed_rule: null }), JSON.stringify(removed)]);
    await comment(pothole, official, 'Demo official reply: thank you, a road crew has been scheduled to repair this section of Protea Road.', d('2026-11-15T15:00:00+02:00'), { official: true });
    const accusation = await comment(pothole, r219, 'Demo comment: names a person and accuses them of corruption without any source.', d('2026-11-15T09:40:00+02:00'));
    await flag('comment', accusation.id, crowd[1], 'personal_accusation', new Date(now - 2 * 3600e3));
    await flag('comment', accusation.id, crowd[2], 'personal_accusation', new Date(now - 2 * 3600e3));
    await flag('comment', accusation.id, crowd[4], 'harassment', new Date(now - 1.5 * 3600e3));
    const dupe = await report({
      author: crowd[5], category: 'roads', title: 'Big hole in Protea Road near school', street: 'Protea Road', ward: 0,
      description: 'There is a big hole in the road near the school. Dangerous for cars.', observed: '2026-11-13', created: d('2026-11-13T07:00:00+02:00'),
      lat: -33.9454, lng: 18.4633,
    });
    await event(dupe, 'submitted', 'user_reported', crowd[5], 'author', d('2026-11-13T07:00:00+02:00'));
    await t.q(`UPDATE reports SET duplicate_of=$2, status='duplicate' WHERE id=$1`, [dupe.id, pothole.id]);
    await event(dupe, 'duplicate', 'user_reported', moderator, 'moderator', d('2026-11-13T09:00:00+02:00'), { note: `Merged into CW-${String(pothole.id).padStart(6, '0')}` });

    const leak = await report({
      author: crowd[6], category: 'water', title: 'Water leak running into the road near the school gate', street: 'Fynbos Avenue', ward: 1,
      description: 'Clean water has been running from a pipe under the pavement into the road for several days. It is getting worse.',
      observed: '2026-11-03', created: d('2026-11-03T07:30:00+02:00'),
    });
    await event(leak, 'submitted', 'user_reported', crowd[6], 'author', d('2026-11-03T07:30:00+02:00'));
    await event(leak, 'acknowledged', 'official', official, 'official', d('2026-11-04T09:00:00+02:00'), { reference: 'DEMO-1002' });
    await event(leak, 'resolved', 'official', official, 'official', d('2026-11-07T16:00:00+02:00'), { note: 'Demo: pipe repaired.' });
    await event(leak, 'reopened', 'user_reported', crowd[7], 'community', d('2026-11-10T08:00:00+02:00'),
      { note: 'Leak has started again at the same spot.', evidence: 'Photo update attached.' });
    await follow(leak, 31);
    await comment(leak, crowd[7], 'Water is running again this morning, same spot as before.', d('2026-11-10T08:05:00+02:00'));
    await comment(leak, official, 'Demo official reply: a team has been asked to re-inspect the pipe.', d('2026-11-10T14:00:00+02:00'), { official: true });

    const bins = await report({
      author: crowd[8], category: 'waste', title: 'Bins not collected for two weeks on Acacia Crescent', street: 'Acacia Crescent', ward: 3,
      description: 'Wheelie bins on the whole street have not been collected for two weeks. Collection day is usually Tuesday.',
      observed: '2026-11-09', created: d('2026-11-09T18:00:00+02:00'),
    });
    await event(bins, 'submitted', 'user_reported', crowd[8], 'author', d('2026-11-09T18:00:00+02:00'));
    await event(bins, 'needs_info', 'user_reported', moderator, 'moderator', d('2026-11-10T10:00:00+02:00'), { note: 'Which section of the street? Please add the nearest cross street.' });
    await follow(bins, 5);
    await comment(bins, crowd[9], 'Same on our side of the street.', d('2026-11-11T07:00:00+02:00'));

    const light = await report({
      author: crowd[10], category: 'electricity', title: 'Streetlight out at the park entrance', street: 'Milkwood Close', ward: 5,
      description: 'The streetlight at the main park entrance has been out for a week. The path is very dark at night.',
      observed: '2026-11-15', created: d('2026-11-15T20:00:00+02:00'),
    });
    await event(light, 'submitted', 'user_reported', crowd[10], 'author', d('2026-11-15T20:00:00+02:00'));
    await follow(light, 2);

    const drain = await report({
      author: crowd[11], category: 'stormwater', title: 'Blocked storm drain after heavy rain', street: 'River Road', ward: 4,
      description: 'The storm drain at the corner is blocked with leaves and litter. Water pooled across the road after the rain.',
      observed: '2026-10-28', created: d('2026-10-28T09:00:00+02:00'),
    });
    await event(drain, 'submitted', 'user_reported', crowd[11], 'author', d('2026-10-28T09:00:00+02:00'));
    await event(drain, 'acknowledged', 'user_reported', crowd[12], 'community', d('2026-10-29T11:00:00+02:00'), { note: 'Call centre gave a reference number.', evidence: 'SMS screenshot.' });
    await event(drain, 'resolved', 'user_reported', crowd[11], 'author', d('2026-11-02T15:00:00+02:00'), { note: 'Drain was cleared today.', evidence: 'Photo update.' });
    await follow(drain, 9);

    // ---- DEMO: fictional parties hold wards (round-robin within each municipality, so every party gets an equal share) ----
    const allWards = await t.q('SELECT id, municipality_id, ward_no FROM wards ORDER BY municipality_id, ward_no');
    let k = 0;
    for (const w of allWards) await t.q('INSERT INTO demo_ward_holders (ward_id, party) VALUES ($1,$2)', [w.id, DEMO_PARTIES[k++ % DEMO_PARTIES.length]]);

    // ---- Background demo reports over the last ~100 days, at random points inside real wards ----
    // Outcome odds below never look at the ward's demo party: identical for every party.
    const busy = await t.q(`SELECT w.id, w.municipality_id, m.code FROM wards w JOIN municipalities m ON m.id=w.municipality_id`);
    const weight = (c) => (c === 'CPT' ? 5 : ['WC023', 'WC024', 'WC044', 'WC025', 'WC043', 'WC032'].includes(c) ? 2 : 1);
    const pool = busy.flatMap((w) => Array(weight(w.code)).fill(w));
    const cats = Object.keys(TEMPLATES);
    for (let i = 0; i < 300; i++) {
      const category = pick(cats);
      const ward = Math.floor(rand() * 6);
      const target = pick(pool);
      const pt = await t.one(`SELECT ST_Y(p) AS lat, ST_X(p) AS lng FROM (SELECT (ST_Dump(ST_GeneratePoints(geom, 1, $2))).geom AS p FROM wards WHERE id=$1) x`,
        [target.id, Math.floor(rand() * 1e6)]);
      const daysAgo = 3 + Math.floor(rand() * 100);
      const created = new Date(now - daysAgo * DAY + Math.floor(rand() * 10) * 3600e3);
      const author = pick(crowd);
      const street = pick(STREETS);
      const rep = await report({
        author, category, ward, street, title: `${pick(TEMPLATES[category])}, ${street}`, lat: pt.lat, lng: pt.lng, municipality_id: target.municipality_id,
        description: 'Demo report generated for the CivicWatch demo. Details are illustrative only.',
        observed: new Date(created.getTime() - Math.floor(rand() * 2) * DAY).toISOString().slice(0, 10), created,
        sensitive: rand() < 0.06,
      });
      await event(rep, 'submitted', 'user_reported', author, 'author', created);
      let at = created.getTime();
      const roll = rand();
      if (roll > 0.25) {
        const officialAck = rand() < 0.45;
        at += (0.3 + rand() * 6) * DAY;
        if (at < now) await event(rep, 'acknowledged', officialAck ? 'official' : 'user_reported', officialAck ? official : pick(crowd), officialAck ? 'official' : 'community', new Date(at),
          officialAck ? { reference: 'DEMO-REF' } : { note: 'Call centre reference received.', evidence: 'Screenshot.' });
        if (roll > 0.45 && at < now) {
          at += (1 + rand() * 10) * DAY;
          const offRes = rand() < 0.5;
          if (at < now) await event(rep, 'resolved', offRes ? 'official' : 'user_reported', offRes ? official : author, offRes ? 'official' : 'author', new Date(at),
            offRes ? {} : { note: 'Fixed.', evidence: 'Photo update.' });
          if (roll > 0.92 && at + 3 * DAY < now) await event(rep, 'reopened', 'user_reported', pick(crowd), 'community', new Date(at + 3 * DAY), { note: 'Problem is back.', evidence: 'Photo.' });
        }
      } else if (roll < 0.05) {
        await event(rep, 'needs_info', 'user_reported', moderator, 'moderator', new Date(at + DAY), { note: 'Please add a nearby landmark.' });
      }
      await follow(rep, Math.floor(rand() * 8));
    }

    // ---- Moderation queue examples ----
    await t.q(`INSERT INTO report_photos (report_id, user_id, path, kind) VALUES ($1,$2,NULL,'community')`, [bins.id, crowd[13].id]);
    const flaggedPhoto = await t.one('SELECT id FROM report_photos WHERE report_id=$1 ORDER BY id DESC LIMIT 1', [bins.id]);
    await flag('photo', flaggedPhoto.id, crowd[14], 'privacy', new Date(now - 3 * 3600e3));

    const possibleDup = await report({
      author: crowd[15], category: 'electricity', title: 'Streetlight not working by the park gate', street: 'Milkwood Close', ward: 5,
      description: 'The light by the park gate is off at night.', observed: '2026-11-16', created: new Date(now - 20 * 3600e3),
    });
    await event(possibleDup, 'submitted', 'user_reported', crowd[15], 'author', new Date(now - 20 * 3600e3));
    await flag('report', possibleDup.id, crowd[16], 'duplicate', new Date(now - 5 * 3600e3));
    await flag('report', possibleDup.id, crowd[17], 'duplicate', new Date(now - 5 * 3600e3));

    await event(light, 'resolved', 'user_reported', crowd[18], 'community', new Date(now - 8 * 3600e3), { note: 'Looks fixed now.', state: 'pending' });

    const spam = await comment(leak, crowd[19], 'Cheap plumbing services, visit spam.example.invalid', new Date(now - 26 * 3600e3));
    for (const u of crowd.slice(20, 24)) await flag('comment', spam.id, u, 'spam', new Date(now - 24 * 3600e3));

    await t.q(`INSERT INTO corrections (target_type, target_id, user_id, details) VALUES ('responsibility', 2, $1, 'In parts of the city electricity is supplied directly by Eskom, not the municipality. Please verify per area.')`, [crowd[25].id]);
  });
  console.log('Demo activity seeded.');
}
