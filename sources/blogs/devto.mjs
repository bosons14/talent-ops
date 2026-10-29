// DEV Community (dev.to) public API: top articles per tag over a time window.
// Authors often list their GitHub username, which links them to their code.
import { identityKeysFromUrl } from '../../lib/util.mjs';
import { postSignal } from './common.mjs';

export const name = 'devto';
export const family = 'blogs';

export async function run(ctx) {
  const { http, cfg, topics, log, warn } = ctx;
  const g = { within_days: 365, per_tag: 30, min_reactions: 10, ...cfg.sources.devto };
  const tags = [...new Set(topics.flatMap((t) => t.tags.map((x) => x.replace(/[^a-z0-9]/g, ''))))];
  const signals = [];
  for (const tag of tags) {
    const url = `https://dev.to/api/articles?tag=${encodeURIComponent(tag)}&top=${g.within_days}&per_page=${g.per_tag}`;
    try {
      const list = await http.get(url, { bucket: 'dev.to' });
      let n = 0;
      for (const a of Array.isArray(list) ? list : []) {
        if ((a.positive_reactions_count ?? 0) < g.min_reactions) continue;
        const u = a.user || {};
        if (a.organization && !u.username) continue;
        const keys = [
          u.username && `devto:${u.username.toLowerCase()}`,
          u.github_username && `gh:${u.github_username.toLowerCase()}`,
          u.twitter_username && `twitter:${u.twitter_username.toLowerCase()}`,
          ...identityKeysFromUrl(u.website_url),
        ];
        signals.push(
          postSignal({
            platform: 'devto',
            keys,
            name: u.name,
            title: a.title,
            url: a.url,
            published: a.published_at,
            engagement: (a.positive_reactions_count ?? 0) + 2 * (a.comments_count ?? 0),
            engagementLabel: 'reactions+2×comments',
            tags: a.tag_list || [],
            summary: a.description,
            topics,
          }),
        );
        n++;
      }
      log(`    devto   #${tag}`.padEnd(46) + ` ${n} posts`);
    } catch (e) {
      warn(`devto #${tag}: ${e.message}`);
    }
  }
  return signals;
}
