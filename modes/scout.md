# Mode: scout — collect evidence

## Recommended execution
Scouting is slow without a token (GitHub search allows 10 requests/minute). Run it as a background subagent or a background shell command where possible, and tell the user roughly how long it may take: about 2 GitHub searches per topic tag at ~6.5 s each without a token.

## Steps
1. Confirm `config/search.json` exists and the topics match `modes/_brief.md`.
2. Run one of:
   - `node scout.mjs` — everything enabled
   - `node scout.mjs --blogs` / `--repos` — one side only
   - `node scout.mjs --only github,devto` — specific sources
   - `node scout.mjs --topics "rust async,tokio"` — ad-hoc topics without editing config
3. Read the summary and warnings. Explain warnings in plain words:
   - `rate limit … add an API token` → suggest `GITHUB_TOKEN`
   - `substack: no publications configured` → offer to add known newsletters, or enable `discover` (undocumented API, may break)
   - `bitbucket: no workspaces configured` → Bitbucket has no public search; it only audits workspaces you name
   - `hashnode …` errors → Hashnode may have changed its GraphQL schema; the run continues without it
4. Re-running is cheap: responses are cached for `cache_ttl_hours` (default 24 h) in `data/cache/`.
5. Offer `rank`.

## Coverage notes to pass on
- Medium tag feeds return only the ~10 newest posts per tag and no clap counts. Following known authors (`sources.medium.authors`) gives better coverage.
- Hacker News surfaces independent blogs. Popular blogs with no linked author appear under "Blogs not yet linked to a person" in the shortlist. Use `profile` mode to identify the author from the site itself, then add the feed with its GitHub login to `sources.feeds.urls`.
- Popular org-owned repos are expanded into their top human contributors (bots are skipped).
