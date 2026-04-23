# Product Requirements Document: NoVa Traffic Intelligence Agent (V1 - Usability Phase)

Owner: Ethan Nguyen  
Status: Active / Refining MVP

## 1. Executive Summary
The NoVa Traffic Intelligence Agent transforms raw VDOT infrastructure data into actionable, conversational insights. The goal is to provide a "Mission Control" for Northern Virginia commuters that explains *why* traffic is bad, not just *that* it is bad.

## 2. Usability Pillars (Immediate Focus)

### 2.1 Zero-Config Interactive Map
- **Requirement**: Replace Mapbox with Leaflet/OpenStreetMap.
- **Goal**: Ensure the map is interactive and functional immediately without requiring external API keys.
- **Capability**: Must render active sensors (green/red based on speed) and incident markers from the live database.

### 2.2 Live Data Integrity
- **Requirement**: Eliminate all hardcoded "fallback" data in the repository and frontend.
- **Goal**: If the database is empty, the UI should show "No live data" rather than fake data.
- **Metric**: The "Current Speed" display must match the `observed_at` value of the single most recent sensor reading in the database.

### 2.3 Conversational Analytics (NL2SQL)
- **Requirement**: Dynamic SQL generation based on the 10,000+ records in PostGIS.
- **Goal**: Support questions like "Which sensor is slowest right now?" or "Show me Route 28 speed trends over the last 2 hours."
- **Visuals**: The graph must dynamically update based on the result set returned by the Agent's SQL query.

### 2.4 Corridor Map Sync
- **Requirement**: When the agent discusses a specific incident or sensor, the Map must pan to that location.

## 3. Technical Requirements

### Backend (FastAPI)
- `GET /api/sensors/live`: Returns all sensors with their most recent speed reading.
- `POST /api/query`: Must return a valid SQL string, a text answer, and the raw data array for charting.

### Frontend (Next.js)
- **Leaflet Integration**: For high-performance, keyless mapping.
- **Dynamic Charting**: Re-render SVG chart based on the `api/query` data response.

## 4. Success Criteria for "Usable MVP"
1. The Map displays actual dots where sensors are located.
2. The Chart shows a line matching the real database timestamps (not hardcoded 8:06 PM).
3. The Speed counter shows the real-time speed of the primary Route 28 merge sensor.
