// GitHub: repository search (by topic and keyword, sorted by stars), top contributors
// of popular org-owned repos, optional user search (location / language / followers),
// and profile enrichment.
//
// Limits: without a token, search = 10 req/min and core = 60 req/h. Set GITHUB_TOKEN
// (a fine-grained token with no extra permissions is enough) for 30/min and 5000/h.
import { identityKeysFromUrl, isoDaysAgo, matchTopics, uniq } from '../../lib/util.mjs';

const API = 'https://api.github.com';
export const name = 'github';
export const family = 'repos';

export const hasToken = () => Boolean(process.env.GITHUB_TOKEN || process.env.GH_TOKEN);

function headers() {
  const t = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  return {
    accept: 'application/vnd.github+json',
    'x-github-api-version': '2022-11-28',
    ...(t ? { authorization: `Bearer ${t}` } : {}),
  };
}

const opts = (bucket) => ({ headers: headers(), bucket });
const isBot = (u) => !u || u.type === 'Bot' || /\[bot\]$|-bot$/i.test(u.login || '');
const q = (s) => (/\s/.test(s) ? `"${s}"` : s);

export function repoSignal(r, topics, extra = {}) {
  const org = r.owner?.type === 'Organization';
  const login = r.owner?.login?.toLowerCase();
  return {
    kind: org ? 'org-repo' : 'repo',
    platform: 'github',
    keys: [org ? `ghorg:${login}` : `gh:${login}`],
    name: null,
    data: {
      full_name: r.full_name,
      url: r.html_url,
      stars: r.stargazers_count,
      forks: r.forks_count,
      description: r.description,
      language: r.language,
      topics: r.topics || [],
      pushed_at: r.pushed_at,
      owner_is_org: org,
      metric: 'stars',
      topics_matched: matchTopics([r.full_name, r.description, ...(r.topics || [])].join(' '), topics),
      ...extra,
    },
  };
}

export async function run(ctx) {
  const { http, cfg, topics, log, warn } = ctx;
  const g = { min_stars: 200, pushed_within_days: 365, per_query: 30, org_repos_to_expand: 10, contributors_per_repo: 5, ...cfg.sources.github };
  const since = isoDaysAgo(g.pushed_within_days);
  const lang = g.language ? ` language:${q(g.language)}` : '';
  const repos = new Map();

  for (const topic of topics) {
    const queries = [...topic.tags.map((t) => `topic:${t}`), `${q(topic.query)} in:name,description`];
    for (const term of queries) {
      const full = `${term} stars:>=${g.min_stars} pushed:>=${since}${lang}`;
      const url = `${API}/search/repositories?q=${encodeURIComponent(full)}&sort=stars&order=desc&per_page=${g.per_query}`;
      try {
        const res = await http.get(url, opts('github-search'));
        let n = 0;
        for (const r of res.items ?? []) {
          if (r.fork || r.archived) continue;
          if (!repos.has(r.full_name)) n++;
          repos.set(r.full_name, r);
        }
        log(`    github  ${term.padEnd(36)} +${n} repos`);
      } catch (e) {
        warn(`github search "${term}": ${e.message}`);
      }
    }
  }

  const signals = [...repos.values()].map((r) => repoSignal(r, topics));

  // Popular repos are often owned by orgs: the people behind them are the contributors.
  const orgRepos = [...repos.values()]
    .filter((r) => r.owner?.type === 'Organization')
    .sort((a, b) => b.stargazers_count - a.stargazers_count)
    .slice(0, g.org_repos_to_expand);
  for (const r of orgRepos) {
    const url = `${API}/repos/${r.full_name}/contributors?per_page=${g.contributors_per_repo + 5}`;
    try {
      const list = await http.get(url, opts('github-core'));
      const people = (Array.isArray(list) ? list : []).filter((u) => !isBot(u)).slice(0, g.contributors_per_repo);
      for (const u of people) {
        signals.push({
          kind: 'contribution',
          platform: 'github',
          keys: [`gh:${u.login.toLowerCase()}`],
          name: null,
          data: {
            full_name: r.full_name,
            url: r.html_url,
            stars: r.stargazers_count,
            contributions: u.contributions,
            pushed_at: r.pushed_at,
            topics_matched: matchTopics([r.full_name, r.description, ...(r.topics || [])].join(' '), topics),
          },
        });
      }
      log(`    github  contributors of ${r.full_name}: ${people.length}`);
    } catch (e) {
      warn(`github contributors ${r.full_name}: ${e.message}`);
    }
  }

  // Optional: find people directly (e.g. location:India language:Rust followers:>=300).
  const us = g.user_search;
  if (us?.enabled) {
    const langs = us.languages?.length ? us.languages : [null];
    for (const l of langs) {
      const parts = [`followers:>=${us.min_followers ?? 200}`, 'type:user'];
      if (us.location) parts.push(`location:${q(us.location)}`);
      if (l) parts.push(`language:${q(l)}`);
      const url = `${API}/search/users?q=${encodeURIComponent(parts.join(' '))}&sort=followers&order=desc&per_page=${us.per_query ?? 30}`;
      try {
        const res = await http.get(url, opts('github-search'));
        for (const u of res.items ?? []) {
          if (isBot(u)) continue;
          signals.push({ kind: 'profile', platform: 'github', keys: [`gh:${u.login.toLowerCase()}`], name: null, data: { login: u.login, found_by: parts.join(' ') } });
        }
        log(`    github  users ${parts.join(' ')}: ${res.items?.length ?? 0}`);
      } catch (e) {
        warn(`github user search: ${e.message}`);
      }
    }
  }
  return signals;
}

/** Profile + owned repos for one login → signals (keys include blog/twitter for linking). */
export async function enrich(ctx, login, { repos = true } = {}) {
  const { http, topics } = ctx;
  const u = await http.get(`${API}/users/${encodeURIComponent(login)}`, opts('github-core'));
  if (u.type === 'Organization') return [];
  const keys = uniq([`gh:${u.login.toLowerCase()}`, ...identityKeysFromUrl(u.blog), u.twitter_username ? `twitter:${u.twitter_username.toLowerCase()}` : null]);
  const out = [
    {
      kind: 'profile',
      platform: 'github',
      keys,
      name: u.name,
      data: {
        name: u.name,
        github_login: u.login,
        github_url: u.html_url,
        bio: u.bio,
        company: u.company,
        location: u.location,
        blog: u.blog || null,
        twitter: u.twitter_username,
        followers: u.followers,
        public_repos: u.public_repos,
        hireable: u.hireable,
        public_email: u.email, // only set if the person chose to publish it on their profile
        joined: u.created_at,
      },
    },
  ];
  if (repos) {
    const list = await http.get(`${API}/users/${encodeURIComponent(login)}/repos?per_page=100&sort=pushed&type=owner`, opts('github-core'));
    for (const r of (Array.isArray(list) ? list : []).filter((r) => !r.fork && r.stargazers_count >= 10)) {
      out.push(repoSignal(r, topics, { source: 'owned' }));
    }
  }
  return out;
}
