#!/usr/bin/env node
// doctor — check setup. `--net` also probes each enabled source with one cheap request.
import { existsSync, accessSync, constants } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { applyDataDirFlag, loadConfig, paths } from './lib/util.mjs';
import { createHttp } from './lib/http.mjs';
import { enabledSources } from './sources/index.mjs';

const argv = applyDataDirFlag();
const net = argv.includes('--net');
const P = paths();
let bad = 0;
const ok = (m) => console.log(`  ✓ ${m}`);
const no = (m, fix) => (bad++, console.log(`  ✗ ${m}${fix ? `\n      → ${fix}` : ''}`));
const info = (m) => console.log(`  · ${m}`);

console.log('talent-ops doctor');
const [maj] = process.versions.node.split('.').map(Number);
maj >= 20 ? ok(`Node ${process.versions.node}`) : no(`Node ${process.versions.node}`, 'install Node 20 or newer');

existsSync(P.config) ? ok(`config ${P.config}`) : no('no config/search.json (using the example)', 'cp config/search.example.json config/search.json, or run the /talent-ops setup mode');
let cfg;
try {
  cfg = await loadConfig();
  cfg.topics.length ? ok(`${cfg.topics.length} topic(s): ${cfg.topics.map((t) => t.name).join(', ')}`) : no('no topics', 'add "topics" to config/search.json');
} catch (e) {
  no(`config does not parse: ${e.message}`);
  process.exit(1);
}

try {
  await mkdir(P.data, { recursive: true });
  accessSync(P.data, constants.W_OK);
  ok(`data dir writable: ${P.data}`);
} catch {
  no(`cannot write ${P.data}`);
}

process.env.GITHUB_TOKEN || process.env.GH_TOKEN ? ok('GITHUB_TOKEN set (5000 req/h)') : info('GITHUB_TOKEN not set — GitHub allows 60 req/h and 10 searches/min; scouting will be slow and enrichment capped');
process.env.GITLAB_TOKEN ? ok('GITLAB_TOKEN set') : info('GITLAB_TOKEN not set (optional)');
if (cfg.sources.bitbucket && cfg.sources.bitbucket.enabled !== false && !(cfg.sources.bitbucket.workspaces || []).length) info('bitbucket enabled but no workspaces listed — it will be skipped');

const srcs = enabledSources(cfg);
info(`enabled sources: ${srcs.map((s) => s.name).join(', ')}`);

if (net) {
  const http = createHttp({ intervals: { default: 300 }, maxWaitMs: 5000 });
  const probes = {
    github: 'https://api.github.com/rate_limit',
    gitlab: `${(cfg.sources.gitlab?.base_url || 'https://gitlab.com').replace(/\/$/, '')}/api/v4/projects?per_page=1`,
    gitea: `${(cfg.sources.gitea?.instances || ['https://codeberg.org'])[0]}/api/v1/repos/search?limit=1`,
    bitbucket: 'https://api.bitbucket.org/2.0/repositories/atlassian?pagelen=1',
    medium: 'https://medium.com/feed/tag/programming',
    devto: 'https://dev.to/api/articles?per_page=1',
    hashnode: null,
    hackernews: 'https://hn.algolia.com/api/v1/search?query=test&hitsPerPage=1',
    substack: 'https://on.substack.com/feed',
    feeds: null,
  };
  for (const s of srcs) {
    const url = probes[s.name];
    if (!url) continue;
    try {
      const r = await http.get(url, { as: s.name === 'medium' || s.name === 'substack' ? 'text' : 'json', retries: 0 });
      if (s.name === 'github') ok(`github reachable · core ${r.resources?.core?.remaining}/${r.resources?.core?.limit} · search ${r.resources?.search?.remaining}/${r.resources?.search?.limit}`);
      else ok(`${s.name} reachable`);
    } catch (e) {
      no(`${s.name}: ${e.message}`);
    }
  }
} else info('run with --net to test connectivity to each source');

console.log(bad ? `\n${bad} problem(s)` : '\nall good');
process.exit(bad ? 1 : 0);
