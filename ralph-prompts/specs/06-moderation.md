# 06 — Moderation

Moderator/admin only. Nav: Queue · Appeals · Corrections · Audit log.

## Queue
- KPIs: Open flags, Needs a second reviewer (escalated), Open appeals, Oldest unreviewed (hours).
- Filters: Type (comment/photo/report/status change), Reason, Sort (priority/oldest/most flags).
- Items grouped by target: priority (High when ≥3 flags from distinct users or reason in {personal_accusation, harassment, privacy}), type, summary, flag count, report ref, age.
- Pending status proposals appear as type "Status change".
- Detail panel: target content, author (pseudonym, account age), flag reasons with counts, author history (prior removals, comments in last 3 days).

## Decision
Actions: Keep · Edit to redact · Remove · Warn author · Escalate to senior; for status proposals: Approve · Reject.
- **Reason code (required)**: personal_accusation, harassment, privacy, spam, off_topic, duplicate, no_evidence, no_violation, other.
- Note shown to the author.
- Saving writes `moderation_actions` (moderator, time, action, reason, before, after) — append-only; resolves flags.

## Appeals
Authors appeal a removal. Must be decided by a moderator other than the original decision-maker (enforced server-side). Outcome: uphold / overturn (restores content).

## Corrections
Requests from residents on reports/municipality data; moderators mark resolved/declined with a note (also audited).

## API
- `GET /api/mod/stats`, `GET /api/mod/queue?type&reason&sort`, `GET /api/mod/item/:type/:id`
- `POST /api/mod/decide` `{target_type, target_id, action, reason_code, note, redacted_body?}`
- `GET /api/mod/appeals`, `POST /api/mod/appeals/:id/decide`
- `GET /api/mod/corrections`, `POST /api/mod/corrections/:id/decide`
- `GET /api/mod/audit`
