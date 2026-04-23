CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS vdot_datasets (
  dataset_id INTEGER PRIMARY KEY,
  dataset_name TEXT NOT NULL,
  source TEXT NOT NULL,
  update_rate TEXT,
  formats TEXT[] NOT NULL DEFAULT '{}',
  default_format TEXT,
  is_mvp BOOLEAN NOT NULL DEFAULT false,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS vdot_dataset_assets (
  id BIGSERIAL PRIMARY KEY,
  dataset_id INTEGER NOT NULL REFERENCES vdot_datasets(dataset_id),
  format TEXT NOT NULL,
  download_url TEXT,
  token_expires_at TIMESTAMPTZ,
  last_checked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(dataset_id, format)
);

CREATE TABLE IF NOT EXISTS source_records (
  id BIGSERIAL PRIMARY KEY,
  source_key TEXT NOT NULL UNIQUE,
  source TEXT NOT NULL,
  dataset_id INTEGER REFERENCES vdot_datasets(dataset_id),
  source_id TEXT NOT NULL,
  source_updated_at TIMESTAMPTZ,
  payload_hash TEXT,
  raw_payload JSONB,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS places (
  id TEXT PRIMARY KEY,
  place_type TEXT NOT NULL,
  name TEXT NOT NULL,
  corridor TEXT,
  direction TEXT,
  mile_marker NUMERIC(7, 3),
  geometry GEOGRAPHY(GEOMETRY, 4326) NOT NULL,
  source_record_id BIGINT REFERENCES source_records(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_places_type CHECK (
    place_type IN ('sensor', 'road_segment', 'incident_location', 'work_zone', 'reference_point')
  )
);

CREATE TABLE IF NOT EXISTS traffic_observations (
  id BIGSERIAL PRIMARY KEY,
  place_id TEXT NOT NULL REFERENCES places(id),
  observed_at TIMESTAMPTZ NOT NULL,
  speed_mph NUMERIC(5, 2),
  volume_vph INTEGER,
  occupancy_pct NUMERIC(5, 2),
  source_record_id BIGINT REFERENCES source_records(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(place_id, observed_at)
);

CREATE TABLE IF NOT EXISTS traffic_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL,
  severity TEXT,
  corridor TEXT,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ,
  geometry GEOGRAPHY(GEOMETRY, 4326) NOT NULL,
  source_record_id BIGINT REFERENCES source_records(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_traffic_events_type CHECK (
    event_type IN ('incident', 'work_zone', 'lane_closure', 'advisory')
  )
);

CREATE TABLE IF NOT EXISTS ingestion_runs (
  id BIGSERIAL PRIMARY KEY,
  source TEXT NOT NULL,
  dataset_id INTEGER REFERENCES vdot_datasets(dataset_id),
  status TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  records_seen INTEGER NOT NULL DEFAULT 0,
  records_written INTEGER NOT NULL DEFAULT 0,
  records_skipped INTEGER NOT NULL DEFAULT 0,
  records_errored INTEGER NOT NULL DEFAULT 0,
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_source_records_source_dataset ON source_records(source, dataset_id, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_places_type_corridor ON places(place_type, corridor);
CREATE INDEX IF NOT EXISTS idx_places_geometry ON places USING GIST(geometry);
CREATE INDEX IF NOT EXISTS idx_traffic_observations_place_time ON traffic_observations(place_id, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_traffic_events_type_status ON traffic_events(event_type, status, starts_at DESC);
CREATE INDEX IF NOT EXISTS idx_traffic_events_geometry ON traffic_events USING GIST(geometry);
CREATE INDEX IF NOT EXISTS idx_ingestion_runs_source_started ON ingestion_runs(source, started_at DESC);

INSERT INTO vdot_datasets (dataset_id, dataset_name, source, update_rate, formats, default_format, is_mvp)
VALUES
  (1, 'Traffic Sensor Stations', 'VDOT SmarterRoads', '1 Minute', ARRAY['tmdd', 'georss', 'detail', 'wfs'], 'tmdd', true),
  (3, 'VDOT Incidents', 'VDOT SmarterRoads', '1 Minute', ARRAY['tmdd', 'georss', 'detail', 'wfs'], 'tmdd', true),
  (4, 'VATraffic Planned Events, Travel Advisories & Lane Closures', 'VDOT SmarterRoads', '1 Minute', ARRAY['tmdd', 'georss', 'detail', 'wfs'], 'tmdd', true),
  (38, 'WorkZone Data eXchange (WZDx)', 'VDOT SmarterRoads', '1 Minute', ARRAY['geojson'], 'geojson', true)
ON CONFLICT (dataset_id) DO UPDATE
SET dataset_name = EXCLUDED.dataset_name,
    source = EXCLUDED.source,
    update_rate = EXCLUDED.update_rate,
    formats = EXCLUDED.formats,
    default_format = EXCLUDED.default_format,
    is_mvp = EXCLUDED.is_mvp,
    last_seen_at = now();

INSERT INTO source_records (source_key, source, dataset_id, source_id, source_updated_at, payload_hash)
VALUES
  ('seed:sensors', 'seed', NULL, 'seed:sensors', now(), 'seed:sensors:v1'),
  ('seed:readings', 'seed', NULL, 'seed:readings', now(), 'seed:readings:v1'),
  ('seed:incident:rt28-001', 'seed', NULL, 'seed:incident:rt28-001', now(), 'seed:incident:rt28-001:v1')
ON CONFLICT (source_key) DO UPDATE
SET source_updated_at = EXCLUDED.source_updated_at,
    payload_hash = EXCLUDED.payload_hash,
    last_seen_at = now();

INSERT INTO places (id, place_type, name, corridor, direction, mile_marker, geometry, source_record_id)
SELECT seed_place.id,
       seed_place.place_type,
       seed_place.name,
       seed_place.corridor,
       seed_place.direction,
       seed_place.mile_marker,
       seed_place.geometry,
       source_records.id
FROM (
  VALUES
    ('rt28-centreville-n-001', 'sensor', 'Rt 28 NB at Centreville', 'VA-28', 'NB', 0.700, ST_SetSRID(ST_MakePoint(-77.4409, 38.8404), 4326)::geography),
    ('rt28-i66-merge-n-002', 'sensor', 'Rt 28 NB at I-66 Merge', 'VA-28', 'NB', 2.100, ST_SetSRID(ST_MakePoint(-77.4442, 38.8583), 4326)::geography),
    ('rt28-dulles-n-003', 'sensor', 'Rt 28 NB near Dulles', 'VA-28', 'NB', 10.400, ST_SetSRID(ST_MakePoint(-77.4489, 38.9562), 4326)::geography),
    ('rt28-sterling-n-004', 'sensor', 'Rt 28 NB at Sterling', 'VA-28', 'NB', 14.200, ST_SetSRID(ST_MakePoint(-77.4297, 39.0067), 4326)::geography),
    ('i66-centreville-e-001', 'sensor', 'I-66 EB at Centreville', 'I-66', 'EB', 52.100, ST_SetSRID(ST_MakePoint(-77.4613, 38.8398), 4326)::geography)
) AS seed_place(id, place_type, name, corridor, direction, mile_marker, geometry)
JOIN source_records
  ON source_records.source_key = 'seed:sensors'
ON CONFLICT (id) DO UPDATE
SET place_type = EXCLUDED.place_type,
    name = EXCLUDED.name,
    corridor = EXCLUDED.corridor,
    direction = EXCLUDED.direction,
    mile_marker = EXCLUDED.mile_marker,
    geometry = EXCLUDED.geometry,
    source_record_id = EXCLUDED.source_record_id,
    updated_at = now();

INSERT INTO traffic_observations (
  place_id,
  observed_at,
  speed_mph,
  volume_vph,
  occupancy_pct,
  source_record_id
)
SELECT seed_observation.place_id,
       seed_observation.observed_at,
       seed_observation.speed_mph,
       seed_observation.volume_vph,
       seed_observation.occupancy_pct,
       source_records.id
FROM (
  VALUES
    ('rt28-i66-merge-n-002', now() - interval '90 minutes', 47, 2100, 22),
    ('rt28-i66-merge-n-002', now() - interval '60 minutes', 31, 2450, 39),
    ('rt28-i66-merge-n-002', now() - interval '30 minutes', 28, 2510, 44),
    ('rt28-i66-merge-n-002', now(), 34, 2300, 34),
    ('rt28-centreville-n-001', now() - interval '60 minutes', 42, 1700, 24),
    ('rt28-dulles-n-003', now() - interval '60 minutes', 55, 1900, 18),
    ('rt28-sterling-n-004', now() - interval '60 minutes', 58, 1600, 15),
    ('i66-centreville-e-001', now() - interval '60 minutes', 38, 3200, 47)
) AS seed_observation(place_id, observed_at, speed_mph, volume_vph, occupancy_pct)
JOIN source_records
  ON source_records.source_key = 'seed:readings'
ON CONFLICT (place_id, observed_at) DO UPDATE
SET speed_mph = EXCLUDED.speed_mph,
    volume_vph = EXCLUDED.volume_vph,
    occupancy_pct = EXCLUDED.occupancy_pct,
    source_record_id = EXCLUDED.source_record_id;

INSERT INTO traffic_events (
  id,
  event_type,
  title,
  description,
  status,
  severity,
  corridor,
  starts_at,
  ends_at,
  geometry,
  source_record_id
)
SELECT 'seed-incident-rt28-001',
       'incident',
       'Disabled vehicle near I-66 merge',
       'Right shoulder blocked near the northbound merge.',
       'active',
       'medium',
       'VA-28',
       now() - interval '45 minutes',
       NULL,
       ST_SetSRID(ST_MakePoint(-77.4444, 38.8592), 4326)::geography,
       source_records.id
FROM source_records
WHERE source_records.source_key = 'seed:incident:rt28-001'
ON CONFLICT (id) DO UPDATE
SET event_type = EXCLUDED.event_type,
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    status = EXCLUDED.status,
    severity = EXCLUDED.severity,
    corridor = EXCLUDED.corridor,
    starts_at = EXCLUDED.starts_at,
    ends_at = EXCLUDED.ends_at,
    geometry = EXCLUDED.geometry,
    source_record_id = EXCLUDED.source_record_id,
    updated_at = now();
