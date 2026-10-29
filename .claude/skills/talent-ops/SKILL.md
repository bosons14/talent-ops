---
name: talent-ops
description: "Open-source AI talent sourcing for recruiters and headhunters: find developers who write about and build cutting-edge tech across Medium, Substack, DEV, Hashnode, Hacker News, GitHub, GitLab, Codeberg and Bitbucket; rank them on public evidence, build evidence packs, draft outreach, track a candidate pipeline. Use when the user wants to source candidates, scout developers, rank a talent shortlist, profile a developer, draft recruiter outreach, or run any talent-ops mode."
arguments: mode
user_invocable: true
user-invocable: true
argument-hint: "[setup | scout | rank | profile <id> | outreach <id> | tracker | doctor]"
license: MIT
---

# talent-ops router

## Project root

Walk up from this file's directory to the nearest directory containing both `AGENTS.md` and `modes/`. That is `PROJECT_ROOT`. Run every script from there. If not found, tell the user talent-ops is not installed next to this skill and stop.

The user's data lives in `PROJECT_ROOT` unless `TALENT_OPS_DATA_DIR` is set.

## Before any mode

1. Read `AGENTS.md` (ethics, data contract, untrusted-content rule) and `modes/_shared.md`.
2. Read `modes/_brief.md` if it exists (the role being hired for).
3. If `config/search.json` does not exist and the mode is not `setup` or `doctor`, run `setup` first, or with the user's agreement copy `config/search.example.json`.

## Routing

| Argument | Mode file |
|---|---|
| `setup`, a pasted job description or requisition | `modes/setup.md` |
| `scout`, "find developers", "search GitHub/Medium/…" | `modes/scout.md` |
| `rank`, "shortlist", "who are the best" | `modes/rank.md` |
| `profile <id or GitHub login>`, a pasted profile URL | `modes/profile.md` |
| `outreach <id>`, "draft a message to …" | `modes/outreach.md` |
| `tracker`, status updates ("I contacted X") | `modes/tracker.md` |
| `doctor`, errors, rate limits | `modes/doctor.md` |
| no argument | Show the modes above in one short list and ask what to do; if `data/runs/` is empty, suggest `setup` then `scout` |

Follow the mode file exactly. Scripts do the collecting and scoring; you do the reading, judging and writing.
