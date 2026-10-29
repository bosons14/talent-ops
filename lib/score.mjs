// Transparent, explainable scoring. Every score comes with the reasons behind it.
//
// Components (each normalised to 0..1 against the 90th percentile of the pool):
//   code      – stars on topic-relevant repos the person owns + meaningful contributions
//               to popular org repos, weighted by recent activity
//   writing   – posts on the target topics, weighted by engagement and recency
//   influence – followers (GitHub)
//   relevance – share of the search topics the person shows evidence for
//   cross     – 1 if the person both builds (code) and explains (writing)
import { recency } from './util.mjs';

export const DEFAULT_WEIGHTS = { code: 0.4, writing: 0.3, influence: 0.1, relevance: 0.15, cross: 0.05 };

function p90(values) {
  const v = values.filter((x) => x > 0).sort((a, b) => a - b);
  if (!v.length) return 1;
  return v[Math.min(v.length - 1, Math.floor(v.length * 0.9))] || 1;
}

export function rawComponents(c, cfg, now = Date.now()) {
  const hl = cfg.recency_half_life_days ?? 180;
  const topicsTotal = Math.max(1, cfg.topics?.length || 1);

  let code = 0;
  for (const r of c.repos) {
    if (r.owner_is_org) continue;
    const rel = r.topics_matched?.length ? 1 : 0.35;
    code += Math.log10(1 + (r.stars || 0)) * (0.4 + 0.6 * recency(r.pushed_at, hl * 2, now)) * rel;
  }
  for (const k of c.contributions) {
    const rel = k.topics_matched?.length ? 1 : 0.35;
    code += 0.7 * Math.log10(1 + (k.stars || 0)) * Math.min(1, (k.contributions || 0) / 100) * rel;
  }

  let writing = 0;
  for (const p of c.posts) {
    const rel = p.topics_matched?.length ? 1 : 0.3;
    writing += (1 + Math.log2(1 + (p.engagement || 0))) * recency(p.published_at, hl, now) * rel;
  }

  const influence = Math.log10(1 + (c.profile.followers || 0));
  const topics = new Set([...c.repos, ...c.contributions, ...c.posts].flatMap((x) => x.topics_matched || []));
  const relevance = Math.min(1, topics.size / topicsTotal);
  const hasCode = c.repos.some((r) => !r.owner_is_org) || c.contributions.length > 0;
  const cross = hasCode && c.posts.length > 0 ? 1 : 0;
  return { code, writing, influence, relevance, cross, topics: [...topics] };
}

export function scoreCandidates(cands, cfg, now = Date.now()) {
  const w = { ...DEFAULT_WEIGHTS, ...(cfg.weights || {}) };
  const raws = cands.map((c) => rawComponents(c, cfg, now));
  const norm = {
    code: p90(raws.map((r) => r.code)),
    writing: p90(raws.map((r) => r.writing)),
    influence: p90(raws.map((r) => r.influence)),
  };
  cands.forEach((c, i) => {
    const r = raws[i];
    const comp = {
      code: Math.min(1, r.code / norm.code),
      writing: Math.min(1, r.writing / norm.writing),
      influence: Math.min(1, r.influence / norm.influence),
      relevance: r.relevance,
      cross: r.cross,
    };
    const total = Object.keys(w).reduce((s, k) => s + w[k] * (comp[k] || 0), 0);
    const wsum = Object.values(w).reduce((a, b) => a + b, 0) || 1;
    c.score = Math.round((1000 * total) / wsum) / 10;
    c.components = Object.fromEntries(Object.entries(comp).map(([k, v]) => [k, Math.round(v * 100)]));
    c.topics_evidenced = r.topics;
    c.why = explain(c);
  });
  return cands.sort((a, b) => b.score - a.score);
}

function explain(c) {
  const why = [];
  const own = c.repos.filter((r) => !r.owner_is_org);
  if (own[0]) {
    const metric = own[0].metric === 'watchers' ? 'watchers' : '★';
    why.push(`owns ${own[0].full_name} (${fmt(own[0].stars)} ${metric})${own.length > 1 ? ` + ${own.length - 1} more repo(s)` : ''}`);
  }
  if (c.contributions[0]) {
    const k = c.contributions[0];
    why.push(`${k.contributions} commits to ${k.full_name} (${fmt(k.stars)} ★)`);
  }
  if (c.posts.length) {
    const top = c.posts[0];
    why.push(`${c.posts.length} post(s); top: "${top.title.slice(0, 70)}" (${top.engagement ? `${top.engagement} ${top.engagement_label || 'engagement'}` : 'no engagement data'} on ${top.engagement_source || top.platform})`);
  }
  if (c.profile.followers) why.push(`${fmt(c.profile.followers)} GitHub followers`);
  if (c.topics_evidenced?.length) why.push(`topics: ${c.topics_evidenced.join(', ')}`);
  return why;
}

export const fmt = (n) => (n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1) + 'k' : String(n ?? 0));
