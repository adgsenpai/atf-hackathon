# AGENTS.md — operational notes

## Layout
- `db/init/*.sql` — PostGIS schema + seed (runs on first boot of the db volume)
- `api/` — Node 22 + Express REST API (`/api/*`), Postgres via `pg`
- `web/` — React 18 + Vite SPA with Leaflet map; built into nginx which proxies `/api` and `/uploads`
- `docker-compose.yml` — `db` (PostGIS), `api`, `web`
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
- Host port 5432 is often taken; db is published on 5433.
- Changing `db/init` requires `docker compose down -v` to take effect.
