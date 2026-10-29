# Mode: tracker — the candidate pipeline

`data/pipeline.md` is a Markdown table the recruiter may also edit by hand.

Statuses: `sourced`, `shortlisted`, `contacted`, `replied`, `screening`, `submitted`, `interviewing`, `offer`, `placed`, `declined`, `not-a-fit`, `do-not-contact`.

- Add: `node tracker.mjs add <id> --role "<role>" --note "<why>"` (default status `shortlisted`)
- Update: `node tracker.mjs set <id> <status> --note "<what happened, date>"`
- List: `node tracker.mjs list [--status contacted]`

When the user says things like "I messaged Asha on LinkedIn" or "Rohan said no", update the status for them and confirm in one line.

`do-not-contact`, `placed`, `not-a-fit` and `declined` are excluded from future shortlists. `do-not-contact` is permanent; if the person asked for their data to be deleted, also remove them from `reports/` and tell the user that cached API responses in `data/cache/` expire on their own (or delete the folder).

Follow-ups: if a `contacted` row is older than 7 days with no reply, you may suggest one polite follow-up draft. Never more than one.
