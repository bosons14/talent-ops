#!/usr/bin/env node
// tracker — manage data/pipeline.md
//
//   node tracker.mjs list [--status contacted]
//   node tracker.mjs add gh-asharaman --role "Staff ML Engineer" --note "strong agents work"
//   node tracker.mjs set gh-asharaman contacted --note "LinkedIn InMail 29 Oct"
//   node tracker.mjs set gh-someone do-not-contact      # never shortlisted again
import { parseArgs } from 'node:util';
import { applyDataDirFlag, paths, readJson } from './lib/util.mjs';
import { STATUSES, readPipeline, upsert, writePipeline } from './lib/tracker.mjs';

const argv = applyDataDirFlag();
const { values: a, positionals } = parseArgs({
  args: argv,
  allowPositionals: true,
  options: { status: { type: 'string' }, role: { type: 'string' }, note: { type: 'string' }, name: { type: 'string' } },
});
const [cmd = 'list', id, status] = positionals;
const P = paths();
const rows = await readPipeline(P.pipeline);

if (cmd === 'list') {
  const shown = rows.filter((r) => !a.status || r.status === a.status);
  if (!shown.length) console.log('pipeline is empty');
  for (const r of shown) console.log(`${r.id.padEnd(28)} ${r.status.padEnd(15)} ${r.role.padEnd(24)} ${r.updated}  ${r.name}`);
  process.exit(0);
}
if (!id) {
  console.error('usage: node tracker.mjs add|set <id> [status] [--role R] [--note N]');
  process.exit(1);
}
if (cmd === 'set' && !STATUSES.includes(status)) {
  console.error(`status must be one of: ${STATUSES.join(', ')}`);
  process.exit(1);
}
if (cmd !== 'add' && cmd !== 'set') {
  console.error(`unknown command ${cmd}`);
  process.exit(1);
}
const store = await readJson(P.candidates, { candidates: [] });
const c = store.candidates.find((x) => x.id === id);
const r = upsert(rows, { id, name: a.name || c?.name, status: cmd === 'add' ? a.status || 'shortlisted' : status, role: a.role, notes: a.note });
await writePipeline(P.pipeline, rows);
console.log(`${r.id}: ${r.status}`);
