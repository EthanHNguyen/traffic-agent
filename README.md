# NoVa Traffic Intelligence Agent

Full-stack MVP scaffold for the NoVa Traffic Intelligence Agent: a conversational traffic analytics platform for the Virginia Route 28 and I-66 corridors.

## What Is Included

- `apps/web`: Next.js + Tailwind UI with chat, chart, and Mapbox-ready incident/sensor map panel.
- `apps/api`: FastAPI backend with health, traffic query, anomaly, and ingestion endpoints.
- `infra/postgres`: Postgres/PostGIS schema and seed data for local development.
- `docker-compose.yml`: Local PostGIS database.
- `docs/PRD.md`: Product requirements captured from the initial brief.

The API starts with a deterministic local agent so the product can run before LangChain/LangGraph, OpenAI keys, or live VDOT credentials are connected.

## Quick Start

### 1. Start Postgres/PostGIS

```bash
docker compose up -d db
```

### 2. Start the API

```bash
cd apps/api
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload --port 8000
```

### 3. Start the web app

```bash
cd apps/web
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`.

## MVP Scope

Phase 1 is focused on the Virginia State Route 28 corridor:

- Store places, traffic observations, traffic events, and source provenance in PostGIS.
- Answer simple natural-language historical speed questions.
- Compare recent traffic to a 30-day-style baseline.
- Return chart and map context with agent answers.

## Environment

API:

- `DATABASE_URL`: Postgres connection string.
- `CORS_ORIGINS`: Comma-separated frontend origins.

Web:

- `NEXT_PUBLIC_API_BASE_URL`: FastAPI base URL.
- `NEXT_PUBLIC_MAPBOX_TOKEN`: Optional Mapbox token. Without it, the map panel uses a plain fallback canvas.
