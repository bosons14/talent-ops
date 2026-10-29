// data/pipeline.md — a plain Markdown table the recruiter (or the agent) can edit by hand.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

export const STATUSES = ['sourced', 'shortlisted', 'contacted', 'replied', 'screening', 'submitted', 'interviewing', 'offer', 'placed', 'declined', 'not-a-fit', 'do-not-contact'];
export const EXCLUDE_FROM_SHORTLIST = new Set(['do-not-contact', 'placed', 'not-a-fit', 'declined']);
const HEADER = '| id | name | status | role | updated | notes |\n|---|---|---|---|---|---|';

export async function readPipeline(file) {
  let text = '';
  try {
    text = await readFile(file, 'utf8');
  } catch {
    return [];
  }
  return text
    .split('\n')
    .filter((l) => /^\|/.test(l) && !/^\|\s*-/.test(l) && !/^\|\s*id\s*\|/i.test(l))
    .map((l) => {
      const [id, name, status, role, updated, notes] = l.split('|').slice(1, -1).map((x) => x.trim());
      return { id, name, status, role, updated, notes };
    })
    .filter((r) => r.id);
}

export async function writePipeline(file, rows) {
  const esc = (s) => String(s ?? '').replace(/\|/g, '/').replace(/\n/g, ' ');
  const body = rows.map((r) => `| ${esc(r.id)} | ${esc(r.name)} | ${esc(r.status)} | ${esc(r.role)} | ${esc(r.updated)} | ${esc(r.notes)} |`).join('\n');
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, `# Candidate pipeline\n\nStatuses: ${STATUSES.join(', ')}\n\n${HEADER}\n${body}\n`);
}

export function upsert(rows, { id, name, status, role, notes }) {
  const today = new Date().toISOString().slice(0, 10);
  let r = rows.find((x) => x.id === id);
  if (!r) {
    r = { id, name: name || id, status: status || 'sourced', role: role || '', updated: today, notes: notes || '' };
    rows.push(r);
    return r;
  }
  if (name) r.name = name;
  if (status) r.status = status;
  if (role) r.role = role;
  if (notes) r.notes = r.notes ? `${r.notes}; ${notes}` : notes;
  r.updated = today;
  return r;
}
