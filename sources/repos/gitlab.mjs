// GitLab (gitlab.com or a self-managed instance): projects by topic / keyword, sorted
// by star_count. Set GITLAB_TOKEN for higher limits; some instances require it.
import { isoDaysAgo, matchTopics } from '../../lib/util.mjs';

export const name = 'gitlab';
export const family = 'repos';

export async function run(ctx) {
  const { http, cfg, topics, log, warn } = ctx;
  const g = { base_url: 'https://gitlab.com', min_stars: 50, active_within_days: 365, per_query: 30, ...cfg.sources.gitlab };
  const api = `${g.base_url.replace(/\/$/, '')}/api/v4`;
  const host = new URL(g.base_url).host;
  const headers = process.env.GITLAB_TOKEN ? { 'private-token': process.env.GITLAB_TOKEN } : {};
  const since = `${isoDaysAgo(g.active_within_days)}T00:00:00Z`;
  const projects = new Map();

  for (const topic of topics) {
    const params = [...topic.tags.map((t) => ['topic', t]), ['search', topic.query]];
    for (const [k, v] of params) {
      const url = `${api}/projects?${k}=${encodeURIComponent(v)}&order_by=star_count&sort=desc&per_page=${g.per_query}&last_activity_after=${since}&archived=false`;
      try {
        const list = await http.get(url, { headers, bucket: host });
        let n = 0;
        for (const p of Array.isArray(list) ? list : []) {
          if (p.star_count < g.min_stars || p.forked_from_project) continue;
          if (!projects.has(p.id)) n++;
          projects.set(p.id, p);
        }
        log(`    gitlab  ${k}:${v}`.padEnd(46) + ` +${n} projects`);
      } catch (e) {
        warn(`gitlab ${k}=${v}: ${e.message}`);
      }
    }
  }

  const prefix = host === 'gitlab.com' ? '' : `${host}/`;
  return [...projects.values()].map((p) => {
    const user = p.namespace?.kind === 'user';
    const ns = String(p.namespace?.full_path || p.namespace?.path || '').toLowerCase();
    const topicsList = p.topics || p.tag_list || [];
    return {
      kind: user ? 'repo' : 'org-repo',
      platform: 'gitlab',
      keys: [user ? `gl:${prefix}${ns}` : `glgroup:${prefix}${ns}`],
      name: user ? p.namespace?.name : null,
      data: {
        full_name: p.path_with_namespace,
        url: p.web_url,
        stars: p.star_count,
        forks: p.forks_count,
        description: p.description,
        topics: topicsList,
        pushed_at: p.last_activity_at,
        owner_is_org: !user,
        metric: 'stars',
        topics_matched: matchTopics([p.path_with_namespace, p.description, ...topicsList].join(' '), topics),
      },
    };
  });
}
