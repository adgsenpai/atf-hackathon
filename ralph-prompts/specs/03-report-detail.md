# 03 — Report detail

## Layout
- Breadcrumb: Reports / Municipality / Ward / Category.
- Badges: category · `Status: X` · `Status is user-reported` or `Municipality confirmed`.
- Title; "Report CW-000123 · Submitted by a resident on … · Observed … · Suburb, Ward".
- Trust banner (amber) explaining confirmation and integration state.
- **Description**, **Evidence (n photos)** with caption (date · author/community update).
- **Status history**: timeline; each event shows status, timestamp, who recorded it (report author / community participant / official response / moderator), provenance badge, note, evidence. Footer: "Next: …" and "Anyone can propose a status change with evidence. Moderators review it before it is shown."
- **Discussion (n)**: comments with author label ("Resident 482" pseudonym), date, Helpful · n, Reply, Flag; one level of replies; removed comments show "Comment removed by moderators. It broke the rule on … Appeal"; official replies show **Verified account**.
- Add an update or comment: textarea, Post comment, Add photo update.
- Sidebar: Follow this report (n people follow), Same problem (count), Flag report; mini map with pin precision; **Who is responsible?** (from municipality responsibilities for this category, with source & verification); **About this report** (Author: Resident (name hidden), Duplicates merged, Reopened n times, Sent to municipality: No integration used); Request a correction.

## API
- `GET /api/reports/:id` → report + photos + events (approved only) + counts + responsibility + viewer flags (following, same)
- `POST/DELETE /api/reports/:id/follow`, `POST /api/reports/:id/same`
- `POST /api/reports/:id/status` `{status, note, evidence}` → official: applied immediately (`official`); others: `pending` proposal for moderation
- `GET/POST /api/reports/:id/comments` `{body, parent_id?}`; `POST /api/comments/:id/helpful`
- `POST /api/flags` `{target_type, target_id, reason, details}`
- `POST /api/corrections` `{target_type, target_id, details}`
- `POST /api/appeals` `{action_id, reason}`
