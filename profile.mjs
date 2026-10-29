#!/usr/bin/env node
// profile — build an evidence pack for one candidate (by shortlist id or GitHub login).
//
//   node profile.mjs gh-asharaman
//   node profile.mjs --github asharaman
//
// Collects: GitHub profile, owned repos and languages, recent public activity, DEV posts,
// Medium / Substack feed items. Writes reports/profile-<id>.md. The agent's `profile`
// mode then reads the actual code and posts and adds a qualitative assessment.
import { parseArgs } from 'node:util';
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { applyDataDirFlag, loadConfig, makeLogger, paths, readJson } from './lib/util.mjs';
import { createHttp } from './lib/http.mjs';
import { createFixtureHttp } from './lib/fixture-http.mjs';
import { parseFeed } from './lib/feed.mjs';
import { fmt } from './lib/score.mjs';
import { links } from './lib/report.mjs';
import * as github from './sources/repos/github.mjs';

const argv = applyDataDirFlag();
const { values: a, positionals } = parseArgs({
  args: argv,
  allowPositionals: true,
  options: { github: { type: 'string' }, fixtures: { type: 'boolean' }, offline: { type: 'boolean' }, config: { type: 'string' } },
});
const target = a.github ? `gh-${a.github.toLowerCase()}` : positionals[0];
if (!target) {
  console.error('usage: node profile.mjs <candidate-id> | --github <login>');
  process.exit(1);
}

const { log, warn } = makeLogger();
const cfg = await loadConfig(a.config);
const P = paths();
const http = a.fixtures ? createFixtureHttp() : createHttp({ cacheDir: P.cache, ttlHours: 12, offline: a.offline, intervals: { default: 800 } });
const ctx = { http, cfg, topics: cfg.topics, log, warn };

const store = await readJson(P.candidates, { candidates: [] });
const c = store.candidates.find((x) => x.id === target) || {
  id: target,
  name: target,
  handles: target.startsWith('gh-') ? { github: target.slice(3) } : {},
  websites: [],
  profile: {},
  repos: [],
  contributions: [],
  posts: [],
  why: [],
  components: {},
};

const API = 'https://api.github.com';
const ghHeaders = { headers: { accept: 'application/vnd.github+json', ...(process.env.GITHUB_TOKEN ? { authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}) } };
const L = [];
const gaps = [];

if (c.handles.github) {
  const login = c.handles.github;
  try {
    const [prof] = await github.enrich(ctx, login, { repos: false });
    Object.assign(c.profile, Object.fromEntries(Object.entries(prof?.data || {}).filter(([, v]) => v != null)));
  } catch (e) {
    warn(`github profile: ${e.message}`);
  }
  let repos = [];
  try {
    for (let page = 1; page <= 3; page++) {
      const list = await http.get(`${API}/users/${login}/repos?per_page=100&type=owner&sort=pushed&page=${page}`, ghHeaders);
      if (!Array.isArray(list) || !list.length) break;
      repos.push(...list);
      if (list.length < 100) break;
    }
  } catch (e) {
    warn(`github repos: ${e.message}`);
  }
  repos = repos.filter((r) => !r.fork);
  const langs = {};
  for (const r of repos) if (r.language) langs[r.language] = (langs[r.language] || 0) + 1 + Math.log10(1 + r.stargazers_count);
  const recent = repos.filter((r) => Date.parse(r.pushed_at) > Date.now() - 90 * 86400e3).length;

  L.push('## Code');
  L.push(`- ${repos.length} original public repos · ${fmt(repos.reduce((s, r) => s + r.stargazers_count, 0))} total ★ · ${recent} pushed in the last 90 days`);
  L.push(`- Main languages: ${Object.entries(langs).sort((x, y) => y[1] - x[1]).slice(0, 6).map(([k]) => k).join(', ') || '—'}`);
  L.push('', '| Repo | ★ | Language | Last push | Description |', '|---|---|---|---|---|');
  for (const r of [...repos].sort((x, y) => y.stargazers_count - x.stargazers_count).slice(0, 12)) {
    L.push(`| [${r.name}](${r.html_url}) | ${fmt(r.stargazers_count)} | ${r.language || ''} | ${r.pushed_at?.slice(0, 10)} | ${String(r.description || '').replace(/\|/g, '/').slice(0, 100)} |`);
  }
  if (c.contributions?.length) {
    L.push('', '**Contributions to popular repos (from scout)**');
    for (const k of c.contributions) L.push(`- [${k.full_name}](${k.url}) — ${k.contributions} commits (${fmt(k.stars)} ★)`);
  }
  if (!recent) gaps.push('No public pushes in 90 days — current work may be private or elsewhere.');
} else {
  gaps.push('No GitHub account linked — check the person’s site or posts for a code profile.');
}

const writing = [...(c.posts || [])];
if (c.handles.devto) {
  try {
    const list = await http.get(`https://dev.to/api/articles?username=${c.handles.devto}&per_page=30`);
    for (const p of list.filter((x) => !x.user?.username || x.user.username.toLowerCase() === c.handles.devto)) writing.push({ platform: 'devto', title: p.title, url: p.url, published_at: p.published_at, engagement: p.positive_reactions_count, engagement_label: 'reactions' });
  } catch (e) {
    warn(`devto: ${e.message}`);
  }
}
for (const [label, url] of [
  c.handles.medium && ['medium', `https://medium.com/feed/@${c.handles.medium}`],
  c.handles.substack && ['substack', `https://${c.handles.substack.includes('.') ? c.handles.substack : c.handles.substack + '.substack.com'}/feed`],
].filter(Boolean)) {
  try {
    for (const it of parseFeed(await http.get(url, { as: 'text' })).items) writing.push({ platform: label, title: it.title, url: it.link, published_at: it.published });
  } catch (e) {
    warn(`${label}: ${e.message}`);
  }
}
const seen = new Set();
const posts = writing.filter((p) => p.url && !seen.has(p.url) && seen.add(p.url)).sort((x, y) => Date.parse(y.published_at || 0) - Date.parse(x.published_at || 0));
L.push('', '## Writing');
if (posts.length) for (const p of posts.slice(0, 15)) L.push(`- ${p.published_at ? String(p.published_at).slice(0, 10) + ' · ' : ''}[${p.title}](${p.url}) — ${p.platform}${p.engagement ? ` (${p.engagement} ${p.engagement_label || ''})` : ''}`);
else {
  L.push('_No posts found on linked platforms._');
  gaps.push('No public writing found — ask about talks, papers or internal docs instead.');
}

const pr = c.profile;
if (!pr.location) gaps.push('Location not on profile — confirm before outreach if the role is location-bound.');
if (!pr.company) gaps.push('Current employer not listed.');
if (c.possible_matches?.length) gaps.push(`Name also matches ${c.possible_matches.join(', ')} — check if same person.`);

const head = [
  `# Evidence pack — ${pr.name || c.name}`,
  '',
  links(c),
  '',
  [pr.company && `**Company:** ${pr.company}`, pr.location && `**Location:** ${pr.location}`, pr.followers != null && `**Followers:** ${fmt(pr.followers)}`, pr.hireable && '**Available for hire** (GitHub flag)', pr.public_email && `**Public email:** ${pr.public_email}`].filter(Boolean).join(' · '),
  pr.bio ? `\n> ${pr.bio}` : '',
  c.score != null ? `\n**Shortlist score:** ${c.score} (code ${c.components.code}, writing ${c.components.writing}, influence ${c.components.influence}, topic coverage ${c.components.relevance})` : '',
  ...(c.why?.length ? ['', ...c.why.map((w) => `- ${w}`)] : []),
  '',
];
const tail = ['', '## Gaps to verify', ...(gaps.length ? gaps.map((g) => `- ${g}`) : ['- none flagged automatically']), '', '## Assessment', '_To be filled by the reviewer (agent `profile` mode or recruiter). Judge the work itself: code quality, depth, ownership, clarity of writing._', ''];

await mkdir(P.reports, { recursive: true });
const out = join(P.reports, `profile-${c.id}.md`);
await writeFile(out, [...head, ...L, ...tail].join('\n'));
console.log(out);
