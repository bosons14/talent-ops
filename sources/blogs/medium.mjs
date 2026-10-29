// Medium via public RSS: https://medium.com/feed/tag/<tag> and /feed/@<handle>.
// Medium has no public search API and RSS carries no clap counts, so engagement is 0
// and each tag feed returns only the ~10 most recent posts. Following known authors
// (sources.medium.authors) gives fuller coverage.
import { parseFeed } from '../../lib/feed.mjs';
import { cleanUrl, identityKeysFromUrl } from '../../lib/util.mjs';
import { authorKey, postSignal, within } from './common.mjs';

export const name = 'medium';
export const family = 'blogs';

export async function run(ctx) {
  const { http, cfg, topics, log, warn } = ctx;
  const g = { within_days: 365, authors: [], ...cfg.sources.medium };
  const feeds = [
    ...uniqueTags(topics).map((t) => [`tag:${t}`, `https://medium.com/feed/tag/${encodeURIComponent(t)}`]),
    ...g.authors.map((a) => [a, `https://medium.com/feed/${a.startsWith('@') ? a : '@' + a}`]),
  ];
  const signals = [];
  for (const [label, url] of feeds) {
    try {
      const xml = await http.get(url, { as: 'text', bucket: 'medium.com' });
      const { items } = parseFeed(xml);
      let n = 0;
      for (const it of items) {
        if (!within(it.published, g.within_days)) continue;
        const link = cleanUrl(it.link);
        const keys = identityKeysFromUrl(link).filter((k) => k.startsWith('medium:'));
        if (!keys.length) {
          // Publication URL (e.g. pub.medium.com/slug): fall back to the author name.
          if (label.startsWith('@')) keys.push(`medium:${label.slice(1).toLowerCase()}`);
          else keys.push(authorKey('medium', it.author));
        }
        signals.push(postSignal({ platform: 'medium', keys, name: it.author, title: it.title, url: link, published: it.published, tags: it.categories, summary: it.summary, topics }));
        n++;
      }
      log(`    medium  ${label}`.padEnd(46) + ` ${n} posts`);
    } catch (e) {
      warn(`medium ${label}: ${e.message}`);
    }
  }
  return signals;
}

function uniqueTags(topics) {
  return [...new Set(topics.flatMap((t) => t.tags))];
}
