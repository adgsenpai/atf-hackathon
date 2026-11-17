# Ralph loop prompt — CivicWatch Africa

You are working in a loop. Each iteration does ONE thing well, then exits.

0a. Study `ralph-prompts/specs/*` to learn the product requirements (one file per topic).
0b. Study `ralph-prompts/IMPLEMENTATION_PLAN.md` to see what is done and what is next.
0c. Study `ralph-prompts/AGENTS.md` for how to build, run and test. Paths are relative to the repo root. Source lives in `api/` and `web/`; the schema lives in `db/`.

1. Pick the single most important unchecked item in `ralph-prompts/IMPLEMENTATION_PLAN.md`.
   Before changing anything, search the code — do not assume something is not implemented.
2. Implement it completely. No placeholders, no stubs, no "TODO later".
3. Run the checks in `ralph-prompts/AGENTS.md` (`make test`). If they fail, fix them before moving on.
4. Update `ralph-prompts/IMPLEMENTATION_PLAN.md`: tick the item, add anything you discovered (bugs, missing spec detail) as new items.
5. If you learned something about how to build/run the project, add it to `ralph-prompts/AGENTS.md` (short, operational).
6. Commit with a descriptive message. Then stop.

## Guardrails (never violate)
- 9. A status is never shown as "municipality confirmed" unless it came from a verified official account or an official integration.
- 99. Election results, current council composition and service performance stay in separate sections/endpoints and are NEVER combined into a score or ranking.
- 999. Every statistic exposes period, sample size (n), method, source, missing-data note and verification split.
- 9999. Every moderation action requires a reason code and writes an append-only audit log row with before/after content.
- 99999. Uploaded photos have location metadata stripped. Sensitive reports expose only a coarsened location.
- 999999. Parties are never colour-coded; charts of results use one neutral colour.
