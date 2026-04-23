# Frontend/UI Automated Test Plan

## Scope

The frontend is the Next app in `apps/web`. UI automation should validate the main operator workflow without requiring the API server, OpenStreetMap tiles, OpenRouter, VDOT, or PostgreSQL. Playwright should mock API responses for default tests and reserve live-service checks for explicit smoke runs.

## Test Layers

1. Page-load and layout checks
   - Verify the command panel, live speed card, chart empty state, and sensor grid render.
   - Verify the app loads sensors on startup and reflects the map sensor count.

2. Query workflow checks
   - Submit a traffic question through the chat input.
   - Verify the request payload.
   - Verify user and agent messages append in order.
   - Verify live speed, latency, anomaly state, and chart update from the mocked API response.

3. Error-state checks
   - Simulate an API failure for `POST /api/query`.
   - Verify the user sees an actionable error and the input recovers for retry.

4. Responsive checks
   - Exercise the same page at desktop and mobile widths.
   - Confirm primary controls remain visible and usable.

5. Optional live smoke checks
   - Run against a real local API only after deterministic tests pass.
   - Validate that the frontend can reach `/api/sensors` and `/api/query`; do not make this part of default CI.

## Default Commands

Run deterministic frontend tests:

```bash
npm run test:e2e
```

Run web type checking:

```bash
npm run typecheck:web
```

## Priority Coverage Matrix

| Flow | Default coverage | Live coverage |
| --- | --- | --- |
| Initial load | Mock sensors, assert shell and count | Optional API reachability |
| Query success | Mock answer/chart/sensors/incidents, assert UI updates | Optional real query |
| Query failure | Mock `500`, assert error and retry state | Optional API outage handling |
| Map | Assert mounted grid and sensor count | Optional tile/marker visual inspection |
| Responsive | Desktop and mobile smoke assertions | None needed |

