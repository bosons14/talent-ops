# Mode: rank — build and review the shortlist

## Steps
1. Run `node rank.mjs` with options that fit the brief:
   - `--top 25` (default from config `shortlist_size`)
   - `--location "India,Remote"` — profile-location substring filter; people with no location are kept unless `--strict-location`
   - `--days 90` — which scout runs to merge
   - `--min-score 20`
2. Read the newest `reports/shortlist-*.md` (and `data/candidates.json` if you need detail).
3. Review it **against the brief**, not just by score. For the top ~10, note:
   - Does the evidence match the must-haves in `modes/_brief.md`?
   - Red flags in the evidence: one old viral repo and nothing since; stars without recent pushes; posts that are tutorials of other people's work; account looks like a company or a bot.
   - "Possible same person" notes: check them (same name ≠ same person).
   - Missing location when the role is location-bound.
4. Present: the table (top 10), then 3–6 bullet points of your judgment, then the coverage limits of this run. Do not mention personal characteristics.
5. Offer next steps: `profile <id>` for the most promising, `tracker` to save them as `shortlisted`.

## Tuning
If the ranking looks wrong for the role, change `weights` or topic `keywords` in `config/search.json` and re-run `rank` (no new scouting needed).
