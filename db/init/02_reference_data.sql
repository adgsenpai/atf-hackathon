-- Reference data. Municipalities, wards, responsibilities, elections and council are REAL data
-- loaded by the API at first boot from api/data/real (see api/src/realdata.js).

INSERT INTO categories (slug, name, sort) VALUES
  ('water','Water',1), ('electricity','Electricity',2), ('roads','Roads',3),
  ('sanitation','Sanitation',4), ('waste','Waste collection',5), ('stormwater','Stormwater',6),
  ('public_spaces','Public spaces',7), ('other','Other',8);
