# iec-api

Scrapes the registered political parties from the Electoral Commission of South Africa
([elections.org.za › Political parties information](https://www.elections.org.za/pw/Parties-And-Candidates/Party-Contact-Information)),
downloads every party logo, saves it all as JSON, and serves it via a Rust (axum) REST API.

## Quick start

```bash
cd iec-api
cargo run --release -- scrape          # writes data/parties.json + data/logos/**
cargo run --release -- serve           # http://localhost:8080
```

Options: `--data-dir <dir>` (or `IEC_DATA_DIR`), `scrape --delay-ms 300 --skip-logos --logo-concurrency 6`,
`serve --bind 0.0.0.0:8080` (or `BIND`), `--refresh-token` (or `REFRESH_TOKEN`) to enable `POST /api/refresh`.

## Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/` | Endpoint index |
| GET | `/health` | `ok` |
| GET | `/api/meta` | Source URL, scrape time, party + logo counts |
| GET | `/api/levels` | Party count per registration level |
| GET | `/api/parties` | List. Query: `q` (name/abbr search), `level` (National, Provincial, Municipal, District, Metro), `has_logo` (true/false), `limit` (default 50), `offset` |
| GET | `/api/parties/{id}` | One party by slug id |
| GET | `/api/parties/{id}/logo` | Redirects to the party's logo file |
| GET | `/api/parties.json` | Full dataset as a download |
| GET | `/logos/...` | Static logo files |
| POST | `/api/refresh` | Re-scrape in the background (`Authorization: Bearer $REFRESH_TOKEN`) |

Example:

```bash
curl 'localhost:8080/api/parties?q=action&level=National'
```

## Party record

```json
{
  "id": "actionsa-actionsa",
  "display_name": "ACTIONSA-ACTIONSA",
  "name": "ACTIONSA",
  "abbreviation": "ACTIONSA",
  "levels": ["National"],
  "contact_person": "…",
  "telephone": "…",
  "email": "…",
  "address": "…",
  "website": "https://…",
  "logo_url": "https://www.elections.org.za/content/img_parties/ACTIONSA.jpg",
  "logo_file": "logos/img_parties/ACTIONSA.jpg"
}
```

## How the scraper works

The page is ASP.NET WebForms: cards only appear after a postback that ticks a level
checkbox, and paging is a stateful "Next" button. The scraper does a fresh GET per level,
posts the checkbox, then follows "Next" while carrying `__VIEWSTATE` / `__EVENTVALIDATION`
forward, merges parties across levels, and downloads unique logos concurrently.

It identifies itself with an honest `User-Agent` (`civicwatch-iec-scraper/x.y`) and waits
between pages. The site's robots.txt allows general crawling but signals `ai-train=no` —
don't use this data to train models. The contact details are published by the IEC for
public use; treat them accordingly.
