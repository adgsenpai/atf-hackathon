-- Reference data. ALL VALUES ARE ILLUSTRATIVE SAMPLES — not real results, boundaries or contacts.

INSERT INTO categories (slug, name, sort) VALUES
  ('water','Water',1), ('electricity','Electricity',2), ('roads','Roads',3),
  ('sanitation','Sanitation',4), ('waste','Waste collection',5), ('stormwater','Stormwater',6),
  ('public_spaces','Public spaces',7), ('other','Other',8);

INSERT INTO municipalities (slug, name, province, kind, is_pilot, wards_note) VALUES
  ('city-of-cape-town', 'City of Cape Town', 'Western Cape', 'Metropolitan municipality', true,
   '[number to verify from IEC / MDB]');

-- Illustrative ward polygons (a 3x2 grid). Replace with MDB boundaries in production.
INSERT INTO wards (municipality_id, code, name, suburb, geom) VALUES
  (1,'S01','Ward S01 (sample)','Protea Heights', ST_GeomFromText('POLYGON((18.44 -33.93, 18.48 -33.93, 18.48 -33.97, 18.44 -33.97, 18.44 -33.93))',4326)),
  (1,'S02','Ward S02 (sample)','Fynbos Vale',    ST_GeomFromText('POLYGON((18.48 -33.93, 18.52 -33.93, 18.52 -33.97, 18.48 -33.97, 18.48 -33.93))',4326)),
  (1,'S03','Ward S03 (sample)','Harbour View',   ST_GeomFromText('POLYGON((18.52 -33.93, 18.56 -33.93, 18.56 -33.97, 18.52 -33.97, 18.52 -33.93))',4326)),
  (1,'S04','Ward S04 (sample)','Kloof Gardens',  ST_GeomFromText('POLYGON((18.44 -33.97, 18.48 -33.97, 18.48 -34.01, 18.44 -34.01, 18.44 -33.97))',4326)),
  (1,'S05','Ward S05 (sample)','Riverside Flats',ST_GeomFromText('POLYGON((18.48 -33.97, 18.52 -33.97, 18.52 -34.01, 18.48 -34.01, 18.48 -33.97))',4326)),
  (1,'S06','Ward S06 (sample)','Milkwood Park',  ST_GeomFromText('POLYGON((18.52 -33.97, 18.56 -33.97, 18.56 -34.01, 18.52 -34.01, 18.52 -33.97))',4326));

INSERT INTO responsibilities (municipality_id, service, categories, responsible, channel, verification, sort) VALUES
  (1,'Water and sanitation', '{water,sanitation}', '[Municipal department, to verify]', '[Official report line or web form]', 'To verify', 1),
  (1,'Electricity', '{electricity}', '[Municipality or Eskom, depends on area; to verify]', '[Official channel]', 'To verify', 2),
  (1,'Municipal roads and stormwater', '{roads,stormwater}', '[Municipal department, to verify]', '[Official channel]', 'To verify', 3),
  (1,'Waste collection', '{waste}', '[Municipal department, to verify]', '[Official channel]', 'To verify', 4),
  (1,'Parks and public spaces', '{public_spaces}', '[Municipal department, to verify]', '[Official channel]', 'To verify', 5),
  (1,'National or provincial roads', '{}', 'Not the municipality. [Roads agency, to verify]', '[Official channel]', 'To verify', 6);

INSERT INTO dataset_sources (municipality_id, dataset, source, url, last_checked, verification) VALUES
  (1,'responsibilities','[municipal service-responsibility record]','[to be added]','[date]','Unverified'),
  (1,'elections','Electoral Commission of South Africa (IEC)','[official results page, to be added]','[date]','Pending'),
  (1,'council','[dated official council record] and [clearly identified secondary source]',NULL,'[date]','Verification pending');

INSERT INTO elections (municipality_id, year, level, is_sample) VALUES
  (1, 2021, 'Local government elections', true),
  (1, 2016, 'Local government elections', true);

-- Sample party rows: layout only; no real results.
INSERT INTO election_results (election_id, party, votes, seats, sort) VALUES
  (1,'Party A (sample)', 600000, 130, 1),
  (1,'Party B (sample)', 210000,  45, 2),
  (1,'Party C (sample)',  60000,  13, 3),
  (1,'Other parties and independents (sample)', 55000, 43, 4),
  (2,'Party A (sample)', 640000, 150, 1),
  (2,'Party B (sample)', 250000,  57, 2),
  (2,'Party C (sample)',  30000,   7, 3),
  (2,'Other parties and independents (sample)', 40000, 17, 4);

INSERT INTO council_snapshots (municipality_id, as_of, verification, arrangement_type, executive_mayor, effective_from, source) VALUES
  (1, '2026-10-01', 'Verification pending', '[single-party / coalition / minority, to verify]', '[name, to verify]', '[date]', '[dated official council record]');

INSERT INTO council_seats (snapshot_id, party, seats_now, change, sort) VALUES
  (1,'Party A (sample)', 129, -1, 1),
  (1,'Party B (sample)',  46,  1, 2),
  (1,'Party C (sample)',  13,  0, 3),
  (1,'Other parties and independents (sample)', 43, 0, 4);

INSERT INTO council_changes (municipality_id, effective_date, description, source_url) VALUES
  (1,'[Date]','By-election, Ward ## (sample)','#'),
  (1,'[Date]','Coalition change (sample)','#');
