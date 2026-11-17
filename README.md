# CivicWatch Africa — MVP

Civiv Watch is an app to help residents enagge with their civic leaders to report problems they are facing, and have a view of prblems others have reported, and whether anyone has responded.

Residents report municipal service problems (water, electricity, roads, sanitation, waste, stormwater, public spaces), add updates and follow each report's status. Every status shows whether it is **user-reported** or **municipality confirmed**. Election results, current council composition and service performance are also shown, so residents may report and measure performanced of their elected representatives.

Pilot area: City of Cape Town. **Prolems seed data is illustrative sample data.**

## Quick start

```bash
cp .env.example .env          # optional
docker compose up --build -d
open http://localhost:8088
make test                     # smoke tests across the whole stack
```

Demo accounts (password `civicwatch`): `resident@example.org`, `official@example.org` (verified municipality rep), `moderator@example.org`, `admin@example.org`. The sign-in page has one-click buttons for each.

Reset the database: `make reset`.

## Architecture

| Service | Tech | Notes |
|---|---|---|
| `db` | PostgreSQL 16 + PostGIS 3.4 | Schema and reference data in `db/init/`. Ward lookup uses `ST_Contains`. Audit log is append-only (trigger). |
| `api` | Node 22, Express 5, `pg` | REST under `/api`. JWT auth, scrypt passwords, metadata stripping for photo uploads (JPEG/PNG), seeds sample data on first boot. |
| `iec-api` | Rust, axum | Registered political parties + logos scraped from the IEC ([`iec-api/README.md`](iec-api/README.md)). Host :8081, and via nginx at `/iec/` (e.g. `/iec/api/parties`). Re-scrape: `docker compose run --rm iec-scrape`. |
| `web` | React 18, Vite, Leaflet, nginx | SPA; nginx proxies `/api` and `/uploads` to the API and `/iec/` to the IEC API. |

## Features (mapped to the UI mockups)

- **Home / browse**: search, category chips, status/date/ward filters, list + clustered map with status-coloured pins, ward boundary overlay, trust disclaimer, mobile layout.
- **Report a problem**: 3-step wizard, category tiles, draggable pin + "use my location", automatic ward/municipality lookup (or "not found"), hide-exact-pin option, PII checks (phone/email rejected), up to 4 photos with location data stripped.
- **Report detail**: provenance badges, trust banner, evidence, status timeline (who recorded each change and how it was verified), follow / same problem / flag, threaded discussion with helpful votes, verified official replies, removed-comment notice with appeal, request a correction, "Who is responsible?" from the responsibility register.
- **Status changes**: residents propose with evidence and moderators approve; verified officials record directly as `municipality confirmed`.
- **Municipality page**: Responsibilities, Election results (Dataset A, neutral bars, no party colours), Current council (Dataset B, dated snapshot plus changes), Performance summary. Each has source, last-checked date and verification state.
- **Performance dashboard**: 6 metrics, each with period, n, method, source, missing data and verification split; weekly stacked chart (official vs user-reported); definitions; CSV export.
- **Moderation**: queue with KPIs, priority, filters; item detail with flag reasons and author history; keep/redact/remove/warn/escalate/merge-duplicate/approve/reject with a **required reason code**; append-only audit log with before/after; appeals handled by a different reviewer; correction requests.

## Ralph loop spec

This repo is set up for iterative autonomous development using the Ralph loop pattern:

All Ralph files live in [`ralph-prompts/`](ralph-prompts/):

- [x] `ralph-prompts/PROMPT.md`: the loop prompt (one task per iteration, plus guardrails)
- [x] `ralph-prompts/specs/`: product requirements, one file per screen or topic
- [x] `ralph-prompts/IMPLEMENTATION_PLAN.md`: prioritized checklist (MVP done ✅; backlog next)
- [x] `ralph-prompts/AGENTS.md`: build, run and test notes for the agent

## Local development without Docker for app code

```bash
docker compose up -d db
make dev-api     # :4000
make dev-web     # :5173 (proxies /api)
```
