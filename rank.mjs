#!/usr/bin/env node
// rank — merge recent scout runs, score, filter, and write the shortlist.
//
//   node rank.mjs                          # top 25 from runs in the last 90 days
//   node rank.mjs --top 50 --location "India,Remote"
//   node rank.mjs --strict-location        # drop people with no location on profile
//   node rank.mjs --include-demo           # include fixture runs (normally ignored)
import { parseArgs } from 'node:util';
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { applyDataDirFlag, listFiles, loadConfig, paths, readJson, writeJson } from './lib/util.mjs';
import { buildCandidates } from './lib/aggregate.mjs';
import { scoreCandidates } from './lib/score.mjs';
import { renderCsv, renderMarkdown } from './lib/report.mjs';
import { EXCLUDE_FROM_SHORTLIST, readPipeline } from './lib/tracker.mjs';

const argv = applyDataDirFlag();
const { values: a } = parseArgs({
  args: argv,
  options: {
    top: { type: 'string' },
    days: { type: 'string' },
    location: { type: 'string' },
    'strict-location': { type: 'boolean' },
    'min-score': { type: 'string' },
    'include-demo': { type: 'boolean' },
    config: { type: 'string' },
    quiet: { type: 'boolean' },
    help: { type: 'boolean', short: 'h' },
  },
});
if (a.help) {
  console.log('usage: node rank.mjs [--top N] [--days N] [--location "a,b"] [--strict-location] [--min-score N] [--include-demo] [--data-dir DIR]');
  process.exit(0);
}

const cfg = await loadConfig(a.config);
const P = paths();
const days = Number(a.days ?? cfg.history_days ?? 90);
const top = Number(a.top ?? cfg.shortlist_size ?? 25);
const cutoff = Date.now() - days * 86400e3;

const runs = [];
for (const f of (await listFiles(P.runs, '.json')).sort()) {
  const r = await readJson(f);
  if (!r || Date.parse(r.started) < cutoff) continue;
  if (r.fixtures && !a['include-demo'] && !process.env.TALENT_OPS_DATA_DIR) continue;
  runs.push(r);
}
if (!runs.length) {
  console.error(`No scout runs in the last ${days} days under ${P.runs}. Run: node scout.mjs`);
  process.exit(1);
}

const all = buildCandidates(runs.flatMap((r) => r.signals));
const pipeline = await readPipeline(P.pipeline);
const statusById = new Map(pipeline.map((r) => [r.id, r.status]));

const f = cfg.filters;
const exclHandles = (f.exclude_handles || []).map((s) => s.toLowerCase());
const exclCompanies = (f.exclude_companies || []).map((s) => s.toLowerCase().replace(/^@/, ''));
const locations = (a.location ? a.location.split(',') : f.locations || []).map((s) => s.trim().toLowerCase()).filter(Boolean);
const strict = a['strict-location'] ?? f.strict_location ?? false;

const dropped = { excluded: 0, company: 0, location: 0, pipeline: 0 };
const eligible = all.filter((c) => {
  if (c.kind !== 'person') return false;
  if (c.keys.some((k) => exclHandles.includes(k) || exclHandles.includes(k.split(':').pop()))) return dropped.excluded++, false;
  const company = String(c.profile.company || '').toLowerCase();
  if (company && exclCompanies.some((x) => company.includes(x))) return dropped.company++, false;
  const st = statusById.get(c.id);
  if (st && EXCLUDE_FROM_SHORTLIST.has(st)) return dropped.pipeline++, false;
  c.pipeline_status = st || '';
  if (locations.length) {
    const loc = String(c.profile.location || '').toLowerCase();
    if (!loc ? strict : !locations.some((x) => loc.includes(x))) return dropped.location++, false;
  }
  return true;
});

const scored = scoreCandidates(eligible, cfg);
const minScore = Number(a['min-score'] ?? f.min_score ?? 0);
const shortlist = scored.filter((c) => c.score >= minScore).slice(0, top);
const blogs = scoreCandidates(all.filter((c) => c.kind === 'blog' && c.posts.length), cfg).slice(0, 15);

const now = new Date();
const stamp = now.toISOString().slice(0, 16).replace(/[:T]/g, '-');
const meta = {
  date: now.toISOString().slice(0, 10),
  generated: now.toISOString(),
  pool: eligible.length,
  runs: runs.length,
  location: locations.join(', '),
  platforms: [...new Set(runs.flatMap((r) => r.sources))],
};

await writeJson(P.candidates, { generated: meta.generated, topics: cfg.topics, candidates: scored, unlinked_blogs: blogs });
await mkdir(P.reports, { recursive: true });
const md = join(P.reports, `shortlist-${stamp}.md`);
const csv = join(P.reports, `shortlist-${stamp}.csv`);
await writeFile(md, renderMarkdown({ shortlist, blogs, cfg, meta }));
await writeFile(csv, renderCsv(shortlist));

if (!a.quiet) {
  console.log(`talent-ops rank · ${eligible.length} eligible of ${all.filter((c) => c.kind === 'person').length} people (${runs.length} run(s), last ${days} days)`);
  const d = Object.entries(dropped).filter(([, v]) => v).map(([k, v]) => `${v} by ${k}`);
  if (d.length) console.log(`  filtered out: ${d.join(', ')}`);
  console.log('');
  shortlist.slice(0, 10).forEach((c, i) => {
    console.log(`  ${String(i + 1).padStart(2)}. ${c.score.toFixed(1).padStart(5)}  ${c.name.slice(0, 28).padEnd(28)} ${(c.profile.location || '').slice(0, 20).padEnd(20)} ${c.why[0] || ''}`);
  });
  console.log(`\n  ${md}\n  ${csv}\n  ${P.candidates}`);
}
