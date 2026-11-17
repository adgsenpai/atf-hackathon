# Implementation plan (Ralph fix plan)

Priority order. Tick only when done and verified by `make test`.

**Status: P0–P5 complete ✅ — real Western Cape data loaded, all smoke checks passing. Next iteration starts at the Backlog.**

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
- [x] Express API: `GET /api/parties` (q, level, has_logo, limit, offset) and `GET /api/parties/meta`, proxied to `IEC_API_URL` (default `http://iec-api:8080`) with a short in-memory cache and a clear 502 error when iec-api is down; logo URLs rewritten to `/iec/logos/...`. Add `IEC_API_URL` to docker-compose + .env.example. Smoke tests.
- [x] Web: `/parties` directory page — search, level filter, has-logo filter, paging, logo + name + abbreviation + levels + contact/website; shows source URL and scraped-at date ("Source: Electoral Commission of South Africa (IEC) · last scraped …"). Nav link. Parties are never colour-coded.
- [x] Web: Municipality page "Registered parties" tab — Metro-level IEC parties (metro municipality) with logos, plus link to full directory; source + scrape date shown. Kept separate from Election results / Current council.
- [x] Election results + council tabs: show the IEC logo next to a party when its name matches a registry entry; keep sample rows clearly labelled sample. Update pilot bar / Methods page to say party registry data is real (IEC) while reports/results remain sample.
- [x] Party detail `/parties/:id` page (all registry fields, logo, IEC source link).
- [x] Bug found: `.page` reset `.container` side padding, so pages touched the screen edge below ~1220px. Fixed.

## P5 — Real Western Cape data (replace every placeholder)
Scope: Western Cape only (1 metro, 5 districts, 24 locals, 406 wards). Fetch: `scripts/data/fetch_real_data.py --province WC` → `api/data/real/`. Never invent numbers; anything not in a source is shown as "Not recorded" with the reason.
- [x] Fetch script + data: MDB boundaries (OpenUp MapIt, 2021 electoral boundaries), National Treasury contacts, IEC 2026 + 2021 seat calculations (all 30 councils; seat sums validated)
- [x] Schema + loader: real municipalities (code, category, district, contacts, geometry), 406 real wards, responsibilities from law + Treasury channels, elections 2026/2021 and council-as-elected 2026 from IEC; drop all sample reference rows; demo reports re-assigned to real wards by PostGIS
- [x] API: municipalities list with category/district + report counts; GeoJSON endpoints for province, municipalities, wards (per municipality); elections/council expose IEC metadata (quota, seats, independents, district 40%)
- [x] Web: map painted with real municipal areas (fill by district, never by party), ward outlines when zoomed in, click → municipality; municipality page map; list grouped by district
- [x] Web: replace placeholder copy (responsibility block, council arrangement, pilot bar, Methods) with real sources and dates
- [x] Landing page (live stats, painted map, how it works, sources) and colourful performance page (status mix, service bars, ward map, busiest wards)
- [x] Ward accountability showcase: fictional demo parties hold wards round-robin with identical odds; alphabetical, no score/rank, labelled demo
- [x] Smoke tests updated for real data (30 councils, 406 wards, CPT 235 seats in 2026, no "[...]" placeholders in any API response)

## Backlog (next iterations)
- [ ] 2026 ward boundaries (MDB 2026 delimitation) once published as open GIS; current wards are the 2021 electoral boundaries
- [ ] Governing arrangement + executive mayor per council from council minutes after first sittings
- [ ] Extend beyond the Western Cape: `fetch_real_data.py --province ''` (all 257 councils)
- [ ] Real 2021 LGE results + current council for Cape Town from the IEC results API (needs an API key); the registry matcher will then link rows automatically
- [ ] Email/push notifications to followers on status change
- [ ] Official municipal integration (send report to municipality) — currently "No integration used"
- [ ] Real ward boundaries from MDB shapefiles (seed uses illustrative polygons)
- [ ] Duplicate suggestions in the wizard (same category within 50 m)
- [ ] Rate limiting by account age; i18n (isiXhosa, Afrikaans)
- [ ] Playwright e2e tests for the three resident flows
