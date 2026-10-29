#!/usr/bin/env node
// scout — collect public evidence from blogs and code hosts, link identities, save a run.
//
//   node scout.mjs                     # blogs + repos, topics from config/search.json
//   node scout.mjs --repos             # code hosts only
//   node scout.mjs --blogs             # writing platforms only
//   node scout.mjs --topics "rust,webassembly"
//   node scout.mjs --only github,devto
//   node scout.mjs --offline           # cached responses only
//   node scout.mjs --fixtures          # bundled sample data (demo, no network)
import { parseArgs } from 'node:util';
import { join } from 'node:path';
import { applyDataDirFlag, loadConfig, makeLogger, normalizeTopic, paths, writeJson } from './lib/util.mjs';
import { createHttp } from './lib/http.mjs';
import { createFixtureHttp } from './lib/fixture-http.mjs';
import { buildCandidates } from './lib/aggregate.mjs';
import { scoreCandidates } from './lib/score.mjs';
import { enabledSources } from './sources/index.mjs';
import * as github from './sources/repos/github.mjs';

const argv = applyDataDirFlag();
const { values: a } = parseArgs({
  args: argv,
  options: {
    blogs: { type: 'boolean' },
    repos: { type: 'boolean' },
    topics: { type: 'string' },
    only: { type: 'string' },
    config: { type: 'string' },
    offline: { type: 'boolean' },
    fixtures: { type: 'boolean' },
    'no-enrich': { type: 'boolean' },
    quiet: { type: 'boolean' },
    help: { type: 'boolean', short: 'h' },
  },
});
if (a.help) {
  console.log(
    'usage: node scout.mjs [--blogs] [--repos] [--topics "a,b"] [--only github,devto] [--offline] [--fixtures] [--no-enrich] [--data-dir DIR] [--config FILE]',
  );
  process.exit(0);
}

const { log, warn } = makeLogger(a.quiet);
const cfg = await loadConfig(a.config);
if (a.topics) cfg.topics = a.topics.split(',').map((s) => normalizeTopic(s.trim())).filter((t) => t.name);
if (!cfg.topics.length) {
  console.error('No topics. Add "topics" to config/search.json or pass --topics.');
  process.exit(1);
}

const P = paths();
const warnings = [];
const ctx = {
  cfg,
  topics: cfg.topics,
  log,
  warn: (m) => {
    warnings.push(m);
    warn(m);
  },
  http: a.fixtures
    ? createFixtureHttp()
    : createHttp({
        cacheDir: P.cache,
        ttlHours: cfg.cache_ttl_hours ?? 24,
        offline: a.offline,
        log,
        intervals: {
          default: 1000,
          'github-search': github.hasToken() ? 2200 : 6500,
          'github-core': github.hasToken() ? 250 : 1000,
          'dev.to': 600,
          'medium.com': 1500,
          substack: 1500,
          hn: 500,
          ...(cfg.rate_limits_ms || {}),
        },
      }),
};

const families = a.blogs && !a.repos ? ['blogs'] : a.repos && !a.blogs ? ['repos'] : ['repos', 'blogs'];
const sources = enabledSources(cfg, { families, only: a.only?.split(',').map((s) => s.trim()) });
const started = new Date();
log(`talent-ops scout · topics: ${cfg.topics.map((t) => t.name).join(', ')}`);
log(`  config: ${cfg.__file}${a.fixtures ? '  (FIXTURE DATA — demo mode)' : ''}`);

const signals = [];
for (const src of sources) {
  log(`  ${src.name}`);
  try {
    signals.push(...(await src.run(ctx)));
  } catch (e) {
    ctx.warn(`${src.name} failed: ${e.message}`);
  }
}

// Enrichment: fetch GitHub profiles for the most promising people. Profiles carry the
// person's blog URL and X handle, which links their writing to their code.
const enrichOn = !a['no-enrich'] && cfg.sources.github?.enabled !== false;
if (enrichOn && signals.some((s) => s.keys.some((k) => k.startsWith('gh:')))) {
  const limit = github.hasToken() ? cfg.enrich_limit_with_token ?? 150 : cfg.enrich_limit ?? 25;
  const prelim = scoreCandidates(
    buildCandidates(signals).filter((c) => c.kind === 'person' && c.handles.github && c.profile.followers == null),
    cfg,
  ).slice(0, limit);
  if (prelim.length) log(`  enriching ${prelim.length} GitHub profile(s)${github.hasToken() ? '' : ' (no GITHUB_TOKEN: limited to ' + limit + ')'}`);
  for (const c of prelim) {
    try {
      signals.push(...(await github.enrich(ctx, c.handles.github)));
    } catch (e) {
      ctx.warn(`enrich ${c.handles.github}: ${e.message}`);
      if (/rate limit/i.test(e.message)) break;
    }
  }
}

const cands = buildCandidates(signals);
const people = cands.filter((c) => c.kind === 'person').length;
const stamp = started.toISOString().replace(/[:.]/g, '-').slice(0, 19);
const file = join(P.runs, `${stamp}${a.fixtures ? '-demo' : ''}.json`);
await writeJson(file, {
  started: started.toISOString(),
  finished: new Date().toISOString(),
  fixtures: Boolean(a.fixtures),
  topics: cfg.topics,
  sources: sources.map((s) => s.name),
  warnings,
  signals,
});
log(`\n  ${signals.length} signals → ${people} people, ${cands.filter((c) => c.kind === 'blog').length} unlinked blogs, ${cands.filter((c) => c.kind === 'org').length} orgs`);
if (warnings.length) log(`  ${warnings.length} warning(s) — see above`);
log(`  saved ${file}\n  next: node rank.mjs${process.env.TALENT_OPS_DATA_DIR ? ' --data-dir ' + process.env.TALENT_OPS_DATA_DIR : ''}`);
