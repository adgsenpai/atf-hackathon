# Implementation plan (Ralph fix plan)

Priority order. Tick only when done and verified by `make test`.

**Status: MVP (P0–P3) complete ✅. Current focus: P4 — real IEC party data.**

## P0b — Repo layout
- [x] Ralph files live in `ralph-prompts/` (PROMPT.md, specs/, IMPLEMENTATION_PLAN.md, AGENTS.md)
- [x] Project code at repo root (`api/`, `web/`, `db/`, `docker-compose.yml`)

## P0 — Platform
- [x] docker-compose with PostGIS db, API, web (nginx) + healthchecks
- [x] Schema: users, municipalities, wards (polygons), categories, reports, photos, status_events, follows, same_problem, comments, comment_votes, flags, moderation_actions (audit), appeals, corrections, sources, responsibilities, election_results, council_seats, council_changes
- [x] Seed: City of Cape Town pilot, sample wards, sample reports/history/comments (clearly labelled sample)
- [x] Auth: register/login, JWT, roles (resident, official, moderator, admin)

## P1 — Resident flows (specs/01, 02, 03)
- [x] Home: search, category chips, status/date/ward filters, list + map, legend, disclaimer
- [x] Report wizard (3 steps): category, pin + PostGIS ward lookup, hide exact pin, description with PII warning, date observed, up to 4 photos (EXIF stripped)
- [x] Report detail: badges, trust banner, evidence, status history with provenance, follow, same problem, flag, discussion with replies/helpful/flag, removed-comment notice + appeal, official replies marked "Verified account", request correction
- [x] Status proposals: community proposals go to moderation; official changes apply directly as `official`

## P2 — Municipality & performance (specs/04, 05)
- [x] Municipality page with tabs: Responsibilities, Election results, Current council, Performance — each with source/last-checked/verification
- [x] Performance dashboard: 6 metric cards with period/n/method/source/missing/verification, weekly stacked bar (official vs user-reported), definitions table, CSV export

## P3 — Moderation (specs/06)
- [x] Queue with KPIs, filters, detail panel, flag reasons, author history
- [x] Decisions: keep/redact/remove/warn/escalate with required reason code, note to author, audit log with before/after
- [x] Appeals (handled by a different moderator), corrections, audit log views

## P4 — Real IEC party data (iec-api → app)
Source: `iec-api` (Rust) serves the real IEC party registry scraped from elections.org.za (`/api/parties`, `/api/meta`, `/logos/...`). Never invent vote counts or seats — the registry has none.
- [ ] Express API: `GET /api/parties` (q, level, has_logo, limit, offset) and `GET /api/parties/meta`, proxied to `IEC_API_URL` (default `http://iec-api:8080`) with a short in-memory cache and a clear 502 error when iec-api is down; logo URLs rewritten to `/iec/logos/...`. Add `IEC_API_URL` to docker-compose + .env.example. Smoke tests.
- [ ] Web: `/parties` directory page — search, level filter, has-logo filter, paging, logo + name + abbreviation + levels + contact/website; shows source URL and scraped-at date ("Source: Electoral Commission of South Africa (IEC) · last scraped …"). Nav link. Parties are never colour-coded.
- [ ] Web: Municipality page "Registered parties" tab — Metro-level IEC parties (metro municipality) with logos, plus link to full directory; source + scrape date shown. Kept separate from Election results / Current council.
- [ ] Election results + council tabs: show the IEC logo next to a party when its name matches a registry entry; keep sample rows clearly labelled sample. Update pilot bar / Methods page to say party registry data is real (IEC) while reports/results remain sample.
- [ ] Party detail `/parties/:id` page (all registry fields, logo, IEC source link).

## Backlog (next iterations)
- [ ] Email/push notifications to followers on status change
- [ ] Official municipal integration (send report to municipality) — currently "No integration used"
- [ ] Real ward boundaries from MDB shapefiles (seed uses illustrative polygons)
- [ ] Duplicate suggestions in the wizard (same category within 50 m)
- [ ] Rate limiting by account age; i18n (isiXhosa, Afrikaans)
- [ ] Playwright e2e tests for the three resident flows
