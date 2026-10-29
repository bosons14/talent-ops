// Any RSS/Atom feed you list (personal blogs, Ghost, Hugo, WordPress, engineering blogs).
// Entry format: "https://example.com/feed.xml" or { "url": ..., "github": "login" } to
// link the blog to a GitHub account you have verified yourself.
import { parseFeed } from '../../lib/feed.mjs';
import { cleanUrl, domainOf } from '../../lib/util.mjs';
import { postSignal, within } from './common.mjs';

export const name = 'feeds';
export const family = 'blogs';

export async function run(ctx) {
  const { http, cfg, topics, log, warn } = ctx;
  const g = { urls: [], within_days: 365, ...cfg.sources.feeds };
  const signals = [];
  for (const entry of g.urls) {
    const e = typeof entry === 'string' ? { url: entry } : entry;
    try {
      const xml = await http.get(e.url, { as: 'text' });
      const { items, title } = parseFeed(xml);
      const keys = [`domain:${domainOf(e.url)}`, `blog:${domainOf(e.url)}`, e.github && `gh:${e.github.toLowerCase()}`];
      let n = 0;
      for (const it of items) {
        if (!within(it.published, g.within_days)) continue;
        const s = postSignal({ platform: 'blog', keys, name: it.author || e.author || title, title: it.title, url: cleanUrl(it.link), published: it.published, tags: it.categories, summary: it.summary, topics });
        if (!s.data.topics_matched.length) continue;
        signals.push(s);
        n++;
      }
      log(`    feed    ${domainOf(e.url)}`.padEnd(46) + ` ${n} on-topic posts`);
    } catch (err) {
      warn(`feed ${e.url}: ${err.message}`);
    }
  }
  return signals;
}
