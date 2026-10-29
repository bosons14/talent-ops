// Offline HTTP stand-in used by `npm run demo` and the tests. Serves files from
// tests/fixtures/ by URL pattern. Fixture text may contain {{DAYS_AGO:n}} which is
// replaced with an ISO timestamp n days before now (so the demo never goes stale),
// and {{UNIX_DAYS_AGO:n}} for epoch seconds.
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { PROJECT_ROOT } from './util.mjs';

const DIR = join(PROJECT_ROOT, 'tests', 'fixtures');

const RULES = [
  [/api\.github\.com\/search\/repositories/, () => 'github-search-repos.json'],
  [/api\.github\.com\/search\/users/, () => 'github-search-users.json'],
  [/api\.github\.com\/repos\/([^/]+)\/([^/]+)\/contributors/, (m) => `github-contributors-${m[1]}-${m[2]}.json`, '[]'],
  [/api\.github\.com\/users\/([^/?]+)\/repos/, (m) => `github-user-repos-${m[1]}.json`, '[]'],
  [/api\.github\.com\/users\/([^/?]+)$/, (m) => `github-user-${m[1]}.json`],
  [/\/api\/v4\/projects/, () => 'gitlab-projects.json'],
  [/\/api\/v1\/repos\/search/, () => 'gitea-search.json'],
  [/dev\.to\/api\/articles/, () => 'devto-articles.json'],
  [/medium\.com\/feed\//, () => 'medium-feed.xml'],
  [/substack\.com\/feed$/, () => 'substack-feed.xml'],
  [/hn\.algolia\.com/, () => 'hn-search.json'],
  [/gql\.hashnode\.com/, () => 'hashnode.json'],
];

function fill(text, now = Date.now()) {
  return text
    .replace(/\{\{DAYS_AGO:(\d+)\}\}/g, (_, d) => new Date(now - d * 86400e3).toISOString())
    .replace(/\{\{UNIX_DAYS_AGO:(\d+)\}\}/g, (_, d) => String(Math.floor((now - d * 86400e3) / 1000)));
}

export function createFixtureHttp({ calls = [] } = {}) {
  async function get(url, o = {}) {
    calls.push(url);
    for (const [re, fileFn, fallback] of RULES) {
      const m = url.match(re);
      if (!m) continue;
      const f = join(DIR, fileFn(m));
      const raw = existsSync(f) ? await readFile(f, 'utf8') : fallback;
      if (raw == null) throw new Error(`HTTP 404 for ${url} (no fixture ${fileFn(m)})`);
      const text = fill(raw);
      return o.as === 'text' ? text : JSON.parse(text);
    }
    throw new Error(`HTTP 404 for ${url} (no fixture rule)`);
  }
  return { get, post: (url, _body, o) => get(url, o), calls };
}
