# 04 — Municipality page

Breadcrumb: Municipalities / Province / Municipality. Header: name, type, "Pilot municipality", wards count (to verify from IEC / MDB).

Tabs (anchor sections): **Responsibilities · Election results · Current council · Performance**.

Banner: "Three separate kinds of information … are shown separately and are never combined into a score."

## Responsibilities
Table: Service · Usually responsible · Official channel · Verification badge. Source line: source, URL, last checked, status, update history, request a correction.

## Official election results (Dataset A)
- Election year selector. Preferred source: Electoral Commission of South Africa (IEC).
- Warning: past results do not describe who controls the council today.
- Table: Party · Votes · Share · bar (ONE neutral colour) · Seats. Parties not colour-coded.
- Source line with verification state.

## Current council composition (Dataset B)
- "Snapshot as of [date]" + verification badge.
- Table: Party · Seats now · Change since election.
- Governing arrangement card: type, executive mayor, effective from, source.
- Changes with effective dates (by-elections, coalition changes) with source links.
- Rule: current control is never inferred from historical election results.

## Service performance (summary)
Three KPI tiles (Reports received, Share acknowledged, Median time to acknowledgement) with period and n, link to dashboard.

## API
- `GET /api/municipalities`, `GET /api/municipalities/:slug` (header + responsibilities)
- `GET /api/municipalities/:slug/elections?year` (Dataset A only)
- `GET /api/municipalities/:slug/council` (Dataset B only)
- Separate endpoints by design — never joined.
