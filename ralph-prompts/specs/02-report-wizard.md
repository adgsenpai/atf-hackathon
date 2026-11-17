# 02 — Report a problem (3-step wizard)

Requires sign-in.

## Step 1 · Details
- Emergency banner: "Emergency? Call your local emergency number. This form does not send your report to the municipality unless a sending option is shown on the last step."
- **What kind of problem?** (required) — 8 category tiles.
- **Where is it?** — map with draggable pin, "Use my current location" (browser geolocation), street or nearest landmark text.
- Ward and municipality are filled in from the pin via PostGIS `ST_Contains` on ward boundaries; shown as **"not found"** if outside boundary data.
- Checkbox: "Hide my exact pin. Show only the street block or suburb (for sensitive reports)."
- **What is the problem?** — title + description. Helper: do not name individuals; no phone numbers or home addresses. Server rejects descriptions containing phone-number or email patterns.
- **Date observed** (≤ today).

## Step 2 · Photos
- Optional, up to 4 images, ≤ 8 MB each, JPEG/PNG/WebP.
- Server strips EXIF/metadata (location) before storing.

## Step 3 · Review & submit
- Summary of all fields; "Sending to municipality: No integration available for this area — your report is published on CivicWatch only."
- Submit → creates report + initial `submitted` status event (`user_reported`, by author) + author auto-follows. Redirect to detail.

## API
- `GET /api/geo/lookup?lat&lng` → `{ ward, municipality }` or nulls
- `POST /api/reports` (JSON) → report
- `POST /api/reports/:id/photos` (multipart `photos[]`) → photos
