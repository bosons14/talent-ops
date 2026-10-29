# Mode: setup — from requisition to search config

Goal: write `modes/_brief.md` (role context) and `config/search.json` (what to scout for).

## Steps
1. Get the role. Accept a pasted job description, a URL (fetch it), or a conversation. Ask at most 3 questions, only for what you can't infer:
   - the 2–5 **technical topics** that define the role (e.g. "LLM inference", "Rust async runtimes")
   - **location constraints** (on-site city, country, remote time zones, or none)
   - companies to **exclude** (the client itself, companies under a no-poach agreement)
2. Copy `modes/_brief.template.md` to `modes/_brief.md` and fill it in.
3. Create `config/search.json` from `config/search.example.json` (keep the user's file if it exists — edit it instead). For each topic write:
   - `name` — human label
   - `tags` — platform tags/topics used for *searching* (GitHub topics, DEV/Hashnode/Medium tags). Lowercase, hyphenated, as the platforms spell them. Broad tags like `llm` are fine here.
   - `keywords` — phrases that make a repo/post *on-topic*. Be specific; these decide relevance scoring. Plural forms match automatically.
   - `query` — free-text search phrase for GitHub/GitLab/HN.
4. Set `filters.locations` (substring match on the profile location, e.g. `["India", "Bengaluru", "Remote"]`), `filters.exclude_companies`, and weights if the role calls for it (see `_shared.md`).
5. If the user knows specific newsletters or blogs, add them: `sources.substack.publications` (subdomain or custom domain), `sources.medium.authors` (`@handle`), `sources.feeds.urls` (RSS URLs; use `{ "url": …, "github": "login" }` when you know the author's GitHub).
6. If the user has accounts on GitHub/GitLab, recommend setting `GITHUB_TOKEN` (no scopes needed) — it raises GitHub limits from 60 to 5000 requests/hour.
7. Run `node doctor.mjs --net` and report. Then offer `scout`.
