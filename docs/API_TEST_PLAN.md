# API Layer Automated Test Plan

## Scope

The API layer is the FastAPI app in `apps/api/app/main.py`. Automated API tests should validate HTTP contracts without requiring OpenRouter, SmarterRoads, or PostgreSQL unless the test is explicitly marked as integration.

## Test Layers

1. Contract tests
   - Verify status codes and response shapes for public endpoints.
   - Cover request validation, especially `TrafficQueryRequest.message` length limits.
   - Assert API endpoints delegate to the intended service or repository function with the expected arguments.

2. Error-path tests
   - Verify `GET /api/sensors/{sensor_id}/latest` returns `404` when no latest observation exists.
   - Verify ingestion responses expose run status and counts for success and failure-like results.

3. Configuration tests
   - Verify CORS uses `settings.cors_origins`, not a hard-coded wildcard.

4. Integration tests
   - Live database, live VDOT, and live OpenRouter tests are useful, but they should be marked `integration` and excluded from the default test command.
   - Run integration tests only when local services and credentials are available.

## Default Commands

Run deterministic API tests:

```bash
cd apps/api && .venv/bin/python -m pytest
```

Run live integration tests:

```bash
cd apps/api && .venv/bin/python -m pytest -m integration
```

## Priority Coverage Matrix

| Endpoint | Default coverage | Integration coverage |
| --- | --- | --- |
| `GET /health` | Status code, response model | None needed |
| `POST /api/query` | Validation, service delegation, serialized response | Optional live OpenRouter and database query generation |
| `POST /api/ingest/vdot` | Serialized ingestion run response | Live VDOT auth/download and DB persistence |
| `GET /api/sensors` | Corridor filter delegation, response shape | Live DB sensor availability |
| `GET /api/sensors/{id}/latest` | Success response and `404` no-data path | Live DB latest reading |

