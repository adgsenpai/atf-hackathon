# AGENTS.md — operational notes

## Layout
- `db/init/*.sql` — PostGIS schema + seed (runs on first boot of the db volume)
- `api/` — Node 22 + Express REST API (`/api/*`), Postgres via `pg`
- `web/` — React 18 + Vite SPA with Leaflet map; built into nginx which proxies `/api` and `/uploads`
- `iec-api/` — Rust (axum) API serving IEC-registered parties + logos from `iec-api/data/` (scraper included)
- `docker-compose.yml` — `db` (PostGIS), `api`, `iec-api`, `web` (+ `iec-scrape` profile)
- `ralph-prompts/` — loop prompt (`PROMPT.md`), product requirements (`specs/`), prioritized plan (`IMPLEMENTATION_PLAN.md`), this file

## Run
    cp .env.example .env        # optional, defaults work
    docker compose up --build -d
    # open http://localhost:8088

Reset the database (re-runs schema + seed): `docker compose down -v && docker compose up --build -d`

## Demo accounts (password: `civicwatch`)
- resident@example.org — resident
- official@example.org — verified municipality representative (City of Cape Town)
- moderator@example.org — moderator
- admin@example.org — admin (senior moderator)

## Ralph loop
Run from the repo root, e.g. `while :; do cat ralph-prompts/PROMPT.md | <agent-cli>; done`

## Test
    make test        # API smoke tests against the running stack (scripts/smoke.sh)

## Gotchas
- Host port 5432 is often taken; db is published on 5433. iec-api is published on 8081 (8080 often taken).
- Re-scrape IEC data: `docker compose run --rm iec-scrape && docker compose restart iec-api`.
- Changing `db/init` requires `docker compose down -v` to take effect.
- Test stack alongside a running dev stack: `WEB_PORT=8098 DB_PORT=5443 IEC_PORT=8091 docker compose -p cwreal up --build -d` then `BASE_URL=http://localhost:8098 make test`.
- Party data: `api/src/routes/parties.js` proxies iec-api (`IEC_API_URL`, 60 s cache). `partyMatcher()` links result/council rows by exact name/abbreviation; anything containing 'sample' never matches.
- Real data: `api/data/real/` is loaded by `api/src/realdata.js` on first boot (empty `municipalities`). Refresh with `python3 -m venv .venv && .venv/bin/pip install xlrd==2.0.1 && .venv/bin/python scripts/data/fetch_real_data.py --province WC`, then `docker compose down -v && docker compose up --build -d`.
- Demo-only: `demo_ward_holders` (fictional parties) and all reports/comments. Never attach demo numbers to real parties.
