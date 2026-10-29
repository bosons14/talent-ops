# Mode: doctor — diagnose setup

Run `node doctor.mjs --net` and explain each ✗ in plain words with the fix:

- **Node too old** → install Node 20+.
- **No config** → run `setup`.
- **GitHub 403 / rate limit** → set `GITHUB_TOKEN` (GitHub → Settings → Developer settings → Fine-grained token, no permissions needed), e.g. `export GITHUB_TOKEN=…` in the shell profile.
- **GitLab 401/403** → some ordering/search requires auth on gitlab.com: set `GITLAB_TOKEN` (scope `read_api`).
- **Network errors for every source** → offline, proxy or firewall. `node scout.mjs --offline` reuses cached responses.
- **Hashnode errors** → the public GraphQL schema may have changed; disable with `"hashnode": { "enabled": false }` until fixed.
- **Substack discovery errors** → the endpoint is undocumented; list publications explicitly instead.
