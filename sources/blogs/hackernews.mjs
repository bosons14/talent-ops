// Hacker News (Algolia API): highly upvoted stories on the topics whose links point at
// personal blogs / Substack / Medium / github.io. This is how independent developer
// blogs ("other developer blogs") get discovered. The HN submitter is often NOT the
// author, so identity comes from the link's domain, never from the HN username.
import { cleanUrl, identityKeysFromUrl } from '../../lib/util.mjs';
import { postSignal } from './common.mjs';

export const name = 'hackernews';
export const family = 'blogs';

export async function run(ctx) {
  const { http, cfg, topics, log, warn } = ctx;
  const g = { min_points: 80, within_days: 365, per_topic: 50, exclude_domains: [], ...cfg.sources.hackernews };
  const since = Math.floor((Date.now() - g.within_days * 86400e3) / 1000);
  const signals = [];
  for (const t of topics) {
    const url = `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(t.query)}&tags=story&numericFilters=${encodeURIComponent(`points>=${g.min_points},created_at_i>=${since}`)}&hitsPerPage=${g.per_topic}`;
    try {
      const res = await http.get(url, { bucket: 'hn' });
      let n = 0;
      for (const h of res.hits ?? []) {
        if (!h.url) continue;
        const keys = identityKeysFromUrl(h.url, g.exclude_domains).filter((k) => !k.startsWith('gh:') || /\.github\.io$/.test(new URL(h.url).hostname));
        if (!keys.length) continue; // big media / generic site
        signals.push(
          postSignal({
            platform: 'hackernews',
            keys,
            name: null,
            title: h.title,
            url: cleanUrl(h.url),
            published: h.created_at,
            engagement: h.points ?? 0,
            engagementLabel: 'HN points',
            topics,
          }),
        );
        n++;
      }
      log(`    hn      "${t.query}"`.padEnd(46) + ` ${n} blog posts`);
    } catch (e) {
      warn(`hackernews "${t.query}": ${e.message}`);
    }
  }
  return signals;
}
