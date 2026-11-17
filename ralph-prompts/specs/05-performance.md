# 05 — Performance dashboard

"Service reports and responses" — what residents reported on this platform and how reports progressed. Not an official rating; ranks no one.

Filters: Period (from/to), Category, Ward, Status source (all / official / user-reported). **Download data (CSV)**.

Read-with-care note: high report counts can reflect population, platform use, connectivity or awareness.

## Metric cards (each shows value, sublabel, Period, Reports included, Method, Source, Missing data, Verification)
1. **Reports received** — count with observed date in period, duplicates merged (excluded).
2. **Share acknowledged** — reports whose first status ≥ acknowledged ÷ all; verification split official vs user-reported.
3. **Median time to first acknowledgement** — median(first acknowledgement − submission) in days; only reports with an acknowledgement.
4. **Share marked resolved** — latest status resolved (reopened counts as not resolved).
5. **Overdue against a service target** — "Not available" unless a verified service target exists for the category.
6. **Reopened and duplicate reports** — counts.

## Chart
Reports received per week, stacked bars: officially confirmed (dark) vs user-reported only (light).

## Definitions table
Acknowledged, Resolved, Median, Service target — with status (Proposed / Standard / To validate).

## API
- `GET /api/municipalities/:slug/performance?from&to&category&ward&source` → `{ period, metrics[], weekly[], definitions[] }`
- `GET /api/municipalities/:slug/performance.csv?...` → one row per report with fields used in the metrics.
