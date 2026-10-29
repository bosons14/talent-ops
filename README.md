# talent-ops

**Open-source AI talent sourcing for recruiters and headhunters, run from Claude Code.**
The recruiter-side companion to [career-ops](https://github.com/santifer/career-ops): career-ops helps candidates find jobs; talent-ops helps you find the developers who are **building and writing about cutting-edge technology**, using only their public work.

```
setup  →  scout  →  rank  →  profile  →  outreach  →  tracker
brief     collect    score     evidence    draft        pipeline
```

## What it searches

| Platform | How | Popularity signal | Notes |
|---|---|---|---|
| **GitHub** | Repo search by topic + keyword, sorted by ★; top contributors of popular org repos; optional user search (location, language, followers) | stars, commits, followers | Set `GITHUB_TOKEN` (60 → 5000 req/h) |
| **GitLab** | Projects by topic / search, sorted by star_count (gitlab.com or self-managed) | stars | `GITLAB_TOKEN` optional |
| **Codeberg / Gitea / Forgejo** | Repo search sorted by stars, any instance | stars | |
| **Bitbucket** | Lists repos of workspaces you name | watchers | Bitbucket has no stars and no public search |
| **DEV (dev.to)** | Top articles per tag over a time window | reactions + comments | Authors often link their GitHub |
| **Hashnode** | Popular posts per tag (GraphQL) | reactions + responses | |
| **Medium** | Tag RSS feeds + authors you follow | none (RSS has no claps) | ~10 newest posts per tag |
| **Substack** | RSS of newsletters you list; optional discovery | via HN | Discovery uses an undocumented endpoint, off by default |
| **Hacker News** | Upvoted stories linking to personal blogs, Substack, Medium, github.io | points | How independent developer blogs are found |
| **Any RSS/Atom feed** | Blogs you list | via HN | Link a blog to its author's GitHub yourself |

Evidence from all of these is merged into **one candidate per person**, using only explicit links: a DEV profile listing its GitHub username, a GitHub profile's website/X fields, Hashnode social links, the same URL. Same-name matches are flagged for you to check and never merged.

## Quick start

```bash
git clone <this repo> talent-ops && cd talent-ops      # Node 20+, no npm install needed
npm run demo        # offline demo with fictional people → demo/reports/shortlist-*.md
export GITHUB_TOKEN=ghp_…                              # recommended
claude              # open Claude Code here, then:
/talent-ops setup   # paste the job description
/talent-ops scout
/talent-ops rank
/talent-ops profile gh-<login>
/talent-ops outreach gh-<login>
```

Without Claude Code, the scripts work on their own:

```bash
cp config/search.example.json config/search.json      # edit topics, locations, exclusions
node scout.mjs                       # or --blogs / --repos / --only github,devto / --topics "rust,wasm"
node rank.mjs --top 30 --location "India,Remote"
node profile.mjs gh-<login>
node tracker.mjs add gh-<login> --role "Staff ML Engineer"
node tracker.mjs set gh-<login> contacted --note "InMail 29 Oct"
node doctor.mjs --net
```

## Outputs

- `reports/shortlist-<date>.md` — ranked table, per-person evidence with links, "why" for every score, popular blogs not yet linked to a person
- `reports/shortlist-<date>.csv` — for spreadsheets or ATS import
- `reports/profile-<id>.md` — evidence pack for one person; Claude adds the assessment
- `data/candidates.json` — everything, machine-readable
- `data/pipeline.md` — your candidate pipeline (editable by hand)

## Scoring (transparent by design)

`score` = weighted mix of **code** (★ on on-topic repos + commits to popular repos, recency-weighted), **writing** (on-topic posts × engagement × recency), **influence** (followers), **topic coverage** and **builds & writes**. Weights are in `config/search.json`. Each component is normalised against the pool's 90th percentile so one superstar doesn't flatten everyone else.

The score ranks **visibility of public work, not ability**. It favours open-source, English-language, long-public developers. Many excellent engineers have no public footprint. Read the evidence before contacting anyone.

## Responsible use

talent-ops uses public, professional information through official APIs and feeds, with built-in rate limits and caching. It does not scrape LinkedIn, harvest emails from commits, or infer personal characteristics, and it never sends messages: Claude drafts, you send. `do-not-contact` is permanent. Candidate data is personal data under GDPR, India's DPDP Act 2023, CCPA and similar laws: keep only what you need, tell people where you found them, and delete on request. See `AGENTS.md` → *Ethical use*.

## Layout

```
scout.mjs rank.mjs profile.mjs tracker.mjs doctor.mjs   CLI
lib/        http (throttle, retry, cache) · feed parser · identity linking · scoring · reports
sources/    repos/{github,gitlab,gitea,bitbucket}.mjs · blogs/{medium,substack,devto,hashnode,hackernews,feeds}.mjs
modes/      agent procedures (setup, scout, rank, profile, outreach, tracker, doctor)
.claude/skills/talent-ops/SKILL.md   /talent-ops router
config/search.example.json           copy to config/search.json
tests/      node:test suite + fictional fixtures (npm test)
```

Adding a source: create `sources/<family>/<name>.mjs` exporting `name`, `family` and `async run(ctx)` returning signals (`{ kind, platform, keys, name, data }`), register it in `sources/index.mjs`, add a config block.

MIT licence.
