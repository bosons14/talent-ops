// Identity resolution: signals from many platforms -> one candidate per person.
//
// Every signal carries identity keys that are known to belong to the same person
// (e.g. a dev.to post whose author lists github_username → [devto:x, gh:y]).
// Keys are merged with union-find. Matching display names alone is NEVER treated as
// proof; it is only reported as a "possible match" for a human to check.
import { cleanUrl, uniq } from './util.mjs';

export const ORG_PREFIXES = ['ghorg:', 'glgroup:', 'bbteam:', 'giteaorg:'];
export const PERSON_PREFIXES = ['gh:', 'gl:', 'gitea:', 'bb:', 'devto:', 'medium:', 'medium-author:', 'substack:', 'hashnode:', 'twitter:', 'blog:'];
const ID_PRIORITY = ['gh:', 'gl:', 'gitea:', 'bb:', 'devto:', 'hashnode:', 'substack:', 'medium:', 'medium-author:', 'twitter:', 'blog:', 'domain:'];

const HANDLE_FIELDS = {
  'gh:': 'github', 'gl:': 'gitlab', 'gitea:': 'gitea', 'bb:': 'bitbucket', 'devto:': 'devto', 'medium:': 'medium',
  'substack:': 'substack', 'hashnode:': 'hashnode', 'twitter:': 'twitter',
};

function unionFind() {
  const parent = new Map();
  const find = (x) => {
    if (!parent.has(x)) parent.set(x, x);
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r);
    while (parent.get(x) !== r) {
      const n = parent.get(x);
      parent.set(x, r);
      x = n;
    }
    return r;
  };
  const union = (a, b) => {
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent.set(rb, ra);
  };
  return { find, union };
}

export const normName = (s) =>
  String(s || '').toLowerCase().normalize('NFKD').replace(/[^\p{L}\s]/gu, '').replace(/\s+/g, ' ').trim();

export function candidateId(keys) {
  for (const p of ID_PRIORITY) {
    const k = keys.filter((x) => x.startsWith(p)).sort()[0];
    if (k) return k.replace(/[:/]+/g, '-');
  }
  return keys.sort()[0].replace(/[:/]+/g, '-');
}

export function buildCandidates(signals) {
  const uf = unionFind();
  for (const s of signals) {
    const keys = uniq(s.keys);
    if (!keys.length) continue;
    for (const k of keys) uf.union(keys[0], k);
  }
  const groups = new Map();
  for (const s of signals) {
    const keys = uniq(s.keys);
    if (!keys.length) continue;
    const root = uf.find(keys[0]);
    if (!groups.has(root)) groups.set(root, { keys: new Set(), signals: [] });
    const g = groups.get(root);
    keys.forEach((k) => g.keys.add(k));
    g.signals.push(s);
  }

  const out = [];
  for (const g of groups.values()) out.push(toCandidate([...g.keys], g.signals));
  annotatePossibleMatches(out);
  return out;
}

function toCandidate(keys, signals) {
  const handles = {};
  const websites = [];
  for (const k of keys) {
    const p = Object.keys(HANDLE_FIELDS).find((x) => k.startsWith(x));
    if (p) (handles[HANDLE_FIELDS[p]] ||= k.slice(p.length));
    if (k.startsWith('domain:')) websites.push(k.slice(7));
  }

  const profile = {};
  for (const s of signals.filter((x) => x.kind === 'profile')) {
    for (const [k, v] of Object.entries(s.data)) if (v != null && v !== '' && profile[k] == null) profile[k] = v;
  }

  const repos = dedupeBy(
    signals.filter((s) => s.kind === 'repo' || s.kind === 'org-repo').map((s) => ({ platform: s.platform, ...s.data })),
    (r) => r.url,
    (a, b) => ({ ...a, ...b, topics_matched: uniq([...(a.topics_matched || []), ...(b.topics_matched || [])]) }),
  );
  const contributions = dedupeBy(
    signals.filter((s) => s.kind === 'contribution').map((s) => ({ platform: s.platform, ...s.data })),
    (r) => r.url,
    (a, b) => (a.contributions >= b.contributions ? a : b),
  );
  const posts = dedupeBy(
    signals.filter((s) => s.kind === 'post').map((s) => ({ platform: s.platform, ...s.data, url: cleanUrl(s.data.url) })),
    (p) => p.url,
    (a, b) => ({
      ...a,
      ...((b.engagement || 0) > (a.engagement || 0) ? { engagement: b.engagement, engagement_label: b.engagement_label, engagement_source: b.platform } : {}),
      also_on: uniq([...(a.also_on || []), b.platform]),
      topics_matched: uniq([...(a.topics_matched || []), ...(b.topics_matched || [])]),
    }),
  );

  const names = signals.map((s) => s.name).filter(Boolean);
  const name = profile.name || mostCommon(names) || handles.github || handles.devto || keys[0];
  const isOrg = keys.every((k) => ORG_PREFIXES.some((p) => k.startsWith(p)));
  const isPerson = keys.some((k) => PERSON_PREFIXES.some((p) => k.startsWith(p)));

  return {
    id: candidateId(keys),
    name,
    keys: keys.sort(),
    kind: isOrg ? 'org' : isPerson ? 'person' : 'blog',
    handles,
    websites: uniq(websites),
    profile,
    repos: repos.sort((a, b) => (b.stars || 0) - (a.stars || 0)),
    contributions: contributions.sort((a, b) => (b.stars || 0) - (a.stars || 0)),
    posts: posts.sort((a, b) => (b.engagement || 0) - (a.engagement || 0)),
    platforms: uniq(signals.map((s) => s.platform)).sort(),
    possible_matches: [],
  };
}

function dedupeBy(items, keyFn, merge) {
  const m = new Map();
  for (const it of items) {
    const k = keyFn(it);
    m.set(k, m.has(k) ? merge(m.get(k), it) : it);
  }
  return [...m.values()];
}

function mostCommon(arr) {
  const c = new Map();
  for (const x of arr) c.set(x, (c.get(x) || 0) + 1);
  return [...c.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
}

/** Same full name (≥2 words) on separate candidates → flag for human review, don't merge. */
function annotatePossibleMatches(cands) {
  const byName = new Map();
  for (const c of cands) {
    if (c.kind === 'org') continue;
    const n = normName(c.name);
    if (n.split(' ').length < 2) continue;
    if (!byName.has(n)) byName.set(n, []);
    byName.get(n).push(c);
  }
  for (const group of byName.values()) {
    if (group.length < 2) continue;
    for (const c of group) c.possible_matches = group.filter((o) => o !== c).map((o) => o.id);
  }
}
