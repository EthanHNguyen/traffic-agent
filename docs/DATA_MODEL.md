# Data Model (Strictly Live)

The NoVa Traffic Intelligence Agent has transitioned from seeded placeholder data to **strictly live VDOT SmarterRoads data**.

## Core Entities

1. **`places`**: Physical infrastructure assets.
   - Live sensors are identified by `OpenTMS-Detector-*` source IDs.
   - Primary corridor is `VA-28` (and variants like `VA-28N`, `VA-28S`).
2. **`traffic_observations`**: Real-time sensor readings.
   - Captured speed is in `speed_mph`.
   - Seeded 34 MPH readings have been purged.
3. **`traffic_events`**: Active road incidents and work zones.
   - `incident`: Real-time accidents/debris.
   - `work_zone`: Planned construction from WZDx.
4. **`traffic_baselines`**: Rolling averages (Day of Week + Hour).
   - Used to determine if a live reading (e.g., 68 mph) is an anomaly.
5. **`traffic_anomalies`**: Deviations >30% from the baseline.

## Dashboard Integration
- The dashboard primary feed now selects the **most active live sensor** on the Route 28 corridor to ensure a data-driven "Mission Control" experience.
