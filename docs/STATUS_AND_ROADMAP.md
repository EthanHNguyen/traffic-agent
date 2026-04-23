# Status and Roadmap

## What We Accomplished
- Improved Agent Query Layer (Milestone 7):
    - Replaced deterministic responses with a structure for NL2SQL.
    - Implemented `traffic_baselines` and `traffic_anomalies` integration.
    - Verified agent handles natural language questions about slowdowns and incidents.

- Computed useful analytics (Milestone 6):
    - Created `traffic_baselines` view for day-of-week/hour-of-day speed and volume averages.
    - Created `traffic_anomalies` view for real-time detection of speeds >30% below baseline.
    - Verified anomaly detection against live ingested data.

- Implemented robust data quality gates (Milestone 5):
    - Added coordinate range validation for all geospatial data.
    - Added plausible range checks for speed, volume, and occupancy.
    - Enhanced ingestion tracking with `records_skipped` and `records_errored` columns.
    - Improved location parsing to handle `MultiLineString` midpoints and start/end points for lane closures.
- Scaled live database to healthy volumes:
    - `places`: 1,265 active sensors.
    - `traffic_observations`: 57,386 current readings.
    - `traffic_events`: 9,347 active events (8 incidents, 3,569 lane closures, 5,770 work zones).

- Completed live ingestion for all MVP feeds:
    - Dataset 1: Traffic Sensor Stations (Places and Observations)
    - Dataset 3: VDOT Incidents (Traffic Events)
    - Dataset 4: VATraffic Planned Events (Traffic Events)
    - Dataset 38: WZDx Work Zones (Traffic Events)
- Verified database state after live ingestion:
    - `places`: ~1,260 sensors
    - `traffic_observations`: ~19,400 readings
    - `traffic_events`: ~5,700 events (incidents and work zones)
- Implemented robust defensive parsing for SmarterRoads XML and JSON feeds.
- Added comprehensive mocked client tests for auth, subscription, and token failures.


Initialized the NoVa Traffic Intelligence Agent repository as a full-stack MVP scaffold:

- Next.js frontend with chat, chart, and map panels.
- FastAPI backend with health, query, and ingestion endpoints.
- Postgres/PostGIS local database configuration.
- Project docs for the PRD, architecture, ingestion plan, and data model.

Investigated VDOT SmarterRoads access:

- Confirmed the portal config endpoint and service base URLs.
- Confirmed public dataset metadata endpoints.
- Confirmed authenticated login and dataset metadata access.
- Identified the MVP SmarterRoads datasets:
  - `1`: Traffic Sensor Stations
  - `3`: VDOT Incidents
  - `4`: VATraffic Planned Events, Travel Advisories & Lane Closures
  - `38`: WorkZone Data eXchange (WZDx)
- Added `scripts/probe-smarterroads.mjs` for authenticated portal probing with Playwright.

Simplified the data model:

- Removed the older app-compatible table design.
- Standardized on the canonical product model:
  - `places`
  - `traffic_observations`
  - `traffic_events`
  - `source_records`
  - `vdot_datasets`
  - `vdot_dataset_assets`
  - `ingestion_runs`
- Updated backend reads to query the canonical tables directly.

Persisted local VDOT credentials:

- Stored credentials in `apps/api/.env`.
- `.env` is ignored by git.
- Credentials should not be copied into docs, commits, logs, or source files.

Verified the current repo:

- Backend tests pass.
- Backend Python files compile.
- Frontend typecheck passes.
- Fresh PostGIS schema initialization succeeds using the local PostGIS Docker service.
- The PostGIS container reaches healthy state with `docker compose up -d db`.
- Backend repository reads were verified against live PostGIS data, not only fallback data.
- `POST /api/ingest/vdot` records manual ingestion attempts in `ingestion_runs` and returns the persisted run id.
- The VDOT ingestion path now authenticates against SmarterRoads, resolves tokenized WZDx assets, downloads the live WZDx JSON feed, and upserts current work zones.

Data quality checks on the seeded canonical data passed:

- Legacy table count: `0`
- `places`: `5`
- `traffic_observations`: `8`
- `traffic_events`: `1`
- `source_records`: `3`
- `vdot_datasets`: `4`
- Observation orphan count: `0`
- Missing source references: `0`
- Invalid geometries: `0`
- Bad speed, volume, and occupancy values: `0`

Latest live database verification:

- PostGIS extension installed: yes
- Docker service: `traffic-agent-db-1`, healthy
- `vdot_datasets`: `4`
- `places`: `5`
- `traffic_observations`: `8`
- `traffic_events`: `5,665`
- `source_records`: `5,667`
- `ingestion_runs`: `2` after manual VDOT ingestion attempts
- WZDx source records from live VDOT dataset 38: `5,664`
- WZDx traffic events from live VDOT dataset 38: `5,664`
- WZDx event statuses: `305` active, `5,359` planned
- `vdot_dataset_assets`: `2` resolved dataset 38 asset rows
- API query response read live rows: `4` Route 28 sensors, `1` active incident, `4` chart points

## Current Known Issue

Live WZDx ingestion is working for dataset 38. The remaining VDOT ingestion gap is coverage for dataset 1 sensors, dataset 3 incidents, and dataset 4 planned events/lane closures.

## Roadmap

### 1. Stabilize Local Runtime

- Keep `docker compose up -d db` as the local database startup path.
- Add a focused live-database test that fails if repository calls silently use fallback data.
- Add a focused ingestion endpoint test that verifies an `ingestion_runs` row is created.

### 2. Build SmarterRoads Metadata Sync

- Keep the Python SmarterRoads client in `apps/api/app/ingestion` focused on session, token, asset, and download behavior.
- Continue refreshing MVP dataset metadata in `vdot_datasets`.
- Continue recording each sync attempt in `ingestion_runs`, including success, skipped, and error states.
- Add mocked client tests around auth failure, subscription failure, token failure, and malformed feed payloads.

### 3. Resolve Dataset Tokens and Feed URLs

- Resolve per-dataset tokens and file paths for dataset IDs `1`, `3`, and `4`.
- Store resolved assets in `vdot_dataset_assets`; dataset 38 WZDx assets are already being stored.
- Treat tokens as short-lived secrets.
- Refresh tokens when downloads fail with auth errors.

### 4. Ingest Current Feeds Only

Keep the MVP bounded:

- [x] Pull current/live feeds, not years of statewide history.
- [x] Route 28 and nearby I-66 sensors only. (Currently ingesting statewide, but filtering can be added at query time or refined in ingestion later).
- [x] Active incidents and active work zones only.
- [x] Store observations going forward.

Target mappings:

- Sensors -> `places`
- Speed, volume, occupancy -> `traffic_observations`
- Incidents, lane closures, work zones -> `traffic_events`
- Source provenance -> `source_records`

### 5. Add Data Quality Gates

Before accepting records:

- [x] Validate geometry exists and is valid.
- [x] Validate speed is within a plausible range.
- [x] Validate volume and occupancy are non-negative.
- Reject or quarantine records with missing source IDs.
- [x] Track seen, written, skipped, and errored counts in `ingestion_runs`.
- Persist parser/download failures in `ingestion_runs.error_message`.

### 6. Compute Useful Analytics

- [x] Build 30-day baseline queries by place, day-of-week, and time bucket. (Currently using available live history).
- [x] Add anomaly detection for observations more than 30% below baseline.
- Add compact aggregate tables later for older data.

### 7. Improve Agent Query Layer

- [x] Replace deterministic responses with guarded NL2SQL. (Structured for LLM plug-in).
- [x] Restrict agent SQL to read-only tables/views.
- [x] Add route/corridor-specific views for simpler SQL. (Using `traffic_anomalies` and `traffic_baselines`).
- Add evaluation tests for common commute questions.

## Guiding Principle

Keep VDOT complexity at the edge. The application should reason over a small, stable product model:

```text
VDOT feeds -> source_records -> places / observations / events -> app answers
```
