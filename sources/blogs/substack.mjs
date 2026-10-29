// Substack. Each publication exposes RSS at <pub>/feed; posts are kept only when they
// match the search topics. Substack has no official search API: discovery via the
// undocumented substack.com search endpoint is OFF by default (sources.substack.discover)
// and may break without notice. Hacker News results also surface Substack writers.
import { parseFeed } from '../../lib/feed.mjs';
import { cleanUrl, domainOf } from '../../lib/util.mjs';
import { postSignal, within } from './common.mjs';

export const name = 'substack';
export const family = 'blogs';

export function pubKey(pub) {
  const d = domainOf(pub);
  if (!d) return [];
  return d.endsWith('.substack.com') ? [`substack:${d.split('.')[0]}`] : [`substack:${d}`, `domain:${d}`];
}

const feedUrl = (pub) => {
  const d = domainOf(pub.includes('.') ? pub : `${pub}.substack.com`);
  return `https://${d}/feed`;
};

export async function run(ctx) {
  const { http, cfg, topics, log, warn } = ctx;
  const g = { publications: [], discover: false, discover_per_topic: 5, within_days: 365, ...cfg.sources.substack };
  const pubs = new Set(g.publications.map((p) => (p.includes('.') ? domainOf(p) : `${p}.substack.com`)));

  if (g.discover) {
    for (const t of topics) {
      try {
        const res = await http.get(`https://substack.com/api/v1/publication/search?query=${encodeURIComponent(t.query)}&page=0&limit=${g.discover_per_topic}`, { bucket: 'substack.com' });
        const list = res?.publications ?? res?.results ?? (Array.isArray(res) ? res : []);
        for (const p of list.slice(0, g.discover_per_topic)) {
          const d = p.custom_domain || (p.subdomain ? `${p.subdomain}.substack.com` : null);
          if (d) pubs.add(d);
        }
        log(`    substack discover "${t.query}": ${list.length}`);
      } catch (e) {
        warn(`substack discovery (undocumented API) "${t.query}": ${e.message}`);
      }
    }
  }
  if (!pubs.size) {
    warn('substack: no publications configured (add sources.substack.publications or enable discover)');
    return [];
  }

  const signals = [];
  for (const pub of pubs) {
    try {
      const xml = await http.get(feedUrl(pub), { as: 'text', bucket: 'substack' });
      const { items, title } = parseFeed(xml);
      let n = 0;
      for (const it of items) {
        if (!within(it.published, g.within_days)) continue;
        const s = postSignal({ platform: 'substack', keys: pubKey(pub), name: it.author || title, title: it.title, url: cleanUrl(it.link), published: it.published, tags: it.categories, summary: it.summary, topics });
        if (!s.data.topics_matched.length) continue; // newsletters are broad: keep on-topic posts only
        signals.push(s);
        n++;
      }
      log(`    substack ${pub}`.padEnd(46) + ` ${n} on-topic posts`);
    } catch (e) {
      warn(`substack ${pub}: ${e.message}`);
    }
  }
  return signals;
}
