# VDOT Data Ingestion Plan

This is the minimal V1 plan for keeping the local PostGIS database fresh from VDOT SmarterRoads.

## Sources

| Dataset ID | SmarterRoads dataset | Target table | Cadence |
| --- | --- | --- | --- |
| 1 | Traffic Sensor Stations | `places`, `traffic_observations` | Every 1 minute |
| 3 | VDOT Incidents | `traffic_events` | Every 1 minute |
| 4 | VATraffic Planned Events, Travel Advisories & Lane Closures | `traffic_events` | Every 5 minutes |
| 38 | WorkZone Data eXchange (WZDx) | `traffic_events` | Every 5 minutes |

## Access Pattern

1. Log in to SmarterRoads with `VDOT_USERNAME` and `VDOT_PASSWORD`.
2. Refresh dataset metadata from `https://smarterroads.vdot.virginia.gov/services/datasets/available`.
3. For each MVP dataset, resolve the dataset file path and token from the authenticated portal APIs.
4. Download from `https://data.511-atis-ttrip-prod.iteriscloud.com{path}?token={token}`.
5. Parse each feed into normalized rows and upsert into PostGIS.
6. Record every attempt in `ingestion_runs`.

## Database Tracking

`vdot_datasets` stores the SmarterRoads dataset catalog entries we care about.

`vdot_dataset_assets` stores resolved file URLs and token metadata. Tokens should be treated as short-lived secrets and refreshed when downloads fail with auth errors.

`ingestion_runs` stores operational history for polling jobs: start time, finish time, status, records seen, records written, and error message.

## Upsert Rules

Traffic sensors:

- Upsert by VDOT station ID into `places` with `place_type = 'sensor'`.
- Keep geometry as `GEOGRAPHY(POINT, 4326)`.
- For Route 28 MVP filtering, keep sensors between Centreville and Sterling.

Traffic readings:

- Insert by `(place_id, observed_at)` into `traffic_observations`.
- Use `ON CONFLICT DO UPDATE` only when the source sends a corrected value for the same timestamp.
- Retain historical readings for baseline and anomaly detection.

Incidents:

- Upsert by VDOT event ID into `traffic_events` with `event_type = 'incident'`.
- Mark cleared incidents by setting `ends_at` when the source reports closure.

Work zones:

- Upsert by VDOT/WZDx event ID into `traffic_events` with `event_type = 'work_zone'` or `event_type = 'lane_closure'`.
- Prefer WZDx GeoJSON geometry when available.

## V1 Job Shape

Run one polling process from the FastAPI service or a small scheduled worker:

```text
every minute:
  sync Traffic Sensor Stations
  sync VDOT Incidents

every five minutes:
  sync VATraffic planned events
  sync WZDx work zones

every hour:
  refresh SmarterRoads dataset metadata and token/file locations
```

For local development, `POST /api/ingest/vdot` runs a real SmarterRoads ingestion attempt and returns the persisted run result. The current implementation authenticates, refreshes MVP dataset metadata, resolves dataset 38 asset paths, downloads the tokenized WZDx JSON feed, and upserts WZDx work zones into `source_records` and `traffic_events`.

## Immediate Build Order

1. Parse incident/event feeds into `traffic_events`.
2. Parse sensor station/readings feed into `places` and `traffic_observations`.
3. Add automated coverage for the live ingestion control flow with mocked SmarterRoads responses.
4. Add scheduler/backoff behavior for recurring ingestion.
5. Add stale-event handling for WZDx rows that disappear from the current feed.
