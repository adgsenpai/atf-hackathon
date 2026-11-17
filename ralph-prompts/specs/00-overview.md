# 00 — Overview

**CivicWatch Africa** lets residents see what municipal services are broken in their area, report problems, add updates to existing reports, and follow their status over time. Pilot area: **City of Cape Town**. All seed data is illustrative sample data and must be labelled as such.

## Principles
1. **Status you can trust** — every status shows whether it is *user-reported* or *confirmed by an official response*, who recorded it, and when.
2. **Politics kept separate** — election results, current council control and service performance are separate sections, each with sources and dates. Never combined into a score.
3. **Fair, explained numbers** — no single score, no ranking. Every statistic lists period, sample size and method.
4. **Safety** — emergencies go to emergency numbers; no names of individuals, phone numbers or home addresses; photo location data stripped; sensitive reports can hide the exact pin.

## Roles
| Role | Can |
|---|---|
| Visitor | browse reports, map, municipality pages, performance, download CSV |
| Resident | report, follow, "same problem", comment, flag, propose status changes, appeal, request corrections |
| Official (verified municipality rep) | everything a resident can + post official replies + set status directly (`official` provenance) |
| Moderator | queue, decisions with reason codes, approve status proposals, corrections |
| Admin | moderator + escalations + appeals of other moderators' decisions |

## Categories
Water, Electricity, Roads, Sanitation, Waste collection, Stormwater, Public spaces, Other.

## Statuses
`submitted → acknowledged → in_progress → resolved`, plus `reopened`, `needs_info` (Needs clarification), `duplicate` (merged).
Each status event has `source`: `user_reported` | `official`.

## Screens (from UI mockups)
1. Home (desktop) — spec 01
2. Home (mobile) — spec 01
3. Report a problem wizard — spec 02
4. Report detail — spec 03
5. Municipality page — spec 04
6–8. Performance dashboard — spec 05
9. Moderation queue — spec 06
