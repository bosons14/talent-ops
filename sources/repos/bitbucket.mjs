// Bitbucket Cloud. Important limits of the platform itself:
//   * Bitbucket has NO stars. The closest popularity signal is the watcher count.
//   * There is NO public cross-workspace search API. You can only list the repos of
//     workspaces you name in config (sources.bitbucket.workspaces).
// So this source audits known workspaces rather than discovering new people.
// Optional auth: BITBUCKET_AUTH="username:app_password_or_api_token".
import { matchTopics } from '../../lib/util.mjs';

export const name = 'bitbucket';
export const family = 'repos';
const API = 'https://api.bitbucket.org/2.0';

export async function run(ctx) {
  const { http, cfg, topics, log, warn } = ctx;
  const g = { workspaces: [], min_watchers: 5, max_repos_per_workspace: 50, ...cfg.sources.bitbucket };
  if (!g.workspaces.length) {
    warn('bitbucket: no workspaces configured (Bitbucket has no public search) — skipping');
    return [];
  }
  const headers = process.env.BITBUCKET_AUTH ? { authorization: 'Basic ' + Buffer.from(process.env.BITBUCKET_AUTH).toString('base64') } : {};
  const signals = [];

  for (const ws of g.workspaces) {
    try {
      const res = await http.get(`${API}/repositories/${encodeURIComponent(ws)}?pagelen=100&sort=-updated_on`, { headers, bucket: 'bitbucket' });
      const repos = (res.values ?? []).filter((r) => !r.is_private).slice(0, g.max_repos_per_workspace);
      for (const r of repos) {
        let watchers = 0;
        try {
          const w = await http.get(`${API}/repositories/${r.full_name}/watchers?pagelen=1`, { headers, bucket: 'bitbucket' });
          watchers = w.size ?? 0;
        } catch {}
        if (watchers < g.min_watchers) continue;
        const team = r.owner?.type === 'team';
        signals.push({
          kind: team ? 'org-repo' : 'repo',
          platform: 'bitbucket',
          keys: [team ? `bbteam:${ws.toLowerCase()}` : `bb:${ws.toLowerCase()}`],
          name: team ? null : r.owner?.display_name,
          data: {
            full_name: r.full_name,
            url: r.links?.html?.href,
            stars: watchers,
            metric: 'watchers',
            description: r.description,
            language: r.language,
            pushed_at: r.updated_on,
            owner_is_org: team,
            topics_matched: matchTopics([r.full_name, r.description, r.language].join(' '), topics),
          },
        });
      }
      log(`    bitbucket ${ws}: ${repos.length} public repos checked`);
    } catch (e) {
      warn(`bitbucket ${ws}: ${e.message}`);
    }
  }
  return signals;
}
