# 01 — Home & browse reports

## Requirements
- Top banner: "Pilot area: City of Cape Town · This mockup uses illustrative sample data only".
- Nav: Reports, Municipalities, Data & methods, Community rules · Sign in · **Report a problem** (primary).
- Hero: "See what is broken in your area, and whether anyone has responded."
- Search box (street, suburb, ward or keyword) → full-text-ish ILIKE across title, description, street, suburb, ward name.
- Category chips: All + 8 categories, single-select.
- Disclaimer (amber): reports are user-submitted and may be unverified; "Sent to municipality" only when sent via official integration or municipality responded; emergencies → emergency number.
- "Latest reports near you · N of TOTAL shown" with **List | Map** toggle (desktop shows both side-by-side).
- Filters: Status, Date (Last 7/30/90 days, All time), Ward.
- Report card: category badge, status badge (coloured dot), provenance badge (`User-reported status` / `Municipality responded`), title, suburb · ward · observed date · followers · updates.
- Map: pins coloured by status (Resolved green, Open teal, Reopened amber, Needs info purple); nearby pins cluster with counts. Note: "Location precision can be reduced for sensitive reports." Map data attribution shown.
- Footer three-up: Status you can trust / Politics kept separate / Fair, explained numbers.
- Mobile: single column, chips scroll horizontally, List/Map toggle + Filters (n) button.

## API
- `GET /api/reports?q&category&status&ward&days&limit&offset` → `{ total, items[] }`
- `GET /api/categories`, `GET /api/wards`

## Acceptance
- Filtering by category=roads returns only roads reports; total reflects filters.
- Sensitive reports return coarsened coordinates (rounded to ~1 km) and no street number.
