// Gitea / Forgejo instances (Codeberg by default): repo search sorted by stars.
import { matchTopics } from '../../lib/util.mjs';

export const name = 'gitea';
export const family = 'repos';

export async function run(ctx) {
  const { http, cfg, topics, log, warn } = ctx;
  const g = { instances: ['https://codeberg.org'], min_stars: 20, per_query: 50, ...cfg.sources.gitea };
  const signals = [];

  for (const base of g.instances) {
    const host = new URL(base).host;
    const seen = new Map();
    for (const topic of topics) {
      const searches = [...topic.tags.map((t) => [t, true]), [topic.query, false]];
      for (const [term, isTopic] of searches) {
        const url = `${base.replace(/\/$/, '')}/api/v1/repos/search?q=${encodeURIComponent(term)}${isTopic ? '&topic=true' : ''}&sort=stars&order=desc&limit=${g.per_query}`;
        try {
          const res = await http.get(url, { bucket: host });
          let n = 0;
          for (const r of res.data ?? []) {
            if (r.fork || r.archived || (r.stars_count ?? 0) < g.min_stars) continue;
            if (!seen.has(r.full_name)) n++;
            seen.set(r.full_name, r);
          }
          log(`    gitea   ${host} ${isTopic ? 'topic:' : ''}${term}`.padEnd(46) + ` +${n} repos`);
        } catch (e) {
          warn(`gitea ${host} "${term}": ${e.message}`);
        }
      }
    }
    for (const r of seen.values()) {
      const login = r.owner?.login?.toLowerCase();
      // Gitea exposes no owner type on repo search; full_name of an org owner is usually empty.
      signals.push({
        kind: 'repo',
        platform: 'gitea',
        keys: [`gitea:${host}/${login}`],
        name: r.owner?.full_name || null,
        data: {
          full_name: r.full_name,
          url: r.html_url,
          stars: r.stars_count,
          forks: r.forks_count,
          description: r.description,
          topics: r.topics || [],
          pushed_at: r.updated_at,
          owner_is_org: false,
          metric: 'stars',
          topics_matched: matchTopics([r.full_name, r.description, ...(r.topics || [])].join(' '), topics),
        },
      });
    }
  }
  return signals;
}
