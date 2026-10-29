// Hashnode public GraphQL API (https://gql.hashnode.com): popular posts per tag.
// The schema is parsed defensively; if Hashnode changes it, this source warns and
// the rest of the run continues.
import { identityKeysFromUrl } from '../../lib/util.mjs';
import { postSignal, within } from './common.mjs';

export const name = 'hashnode';
export const family = 'blogs';

const QUERY = `query TagPosts($slug: String!, $first: Int!) {
  tag(slug: $slug) {
    posts(first: $first, filter: { sortBy: popular }) {
      edges { node {
        title url publishedAt reactionCount responseCount
        tags { slug }
        author { username name socialMediaLinks { github twitter website } }
      } }
    }
  }
}`;

export async function run(ctx) {
  const { http, cfg, topics, log, warn } = ctx;
  const g = { per_tag: 20, within_days: 365, min_reactions: 5, ...cfg.sources.hashnode };
  const tags = [...new Set(topics.flatMap((t) => t.tags))];
  const headers = { 'content-type': 'application/json', ...(process.env.HASHNODE_TOKEN ? { authorization: process.env.HASHNODE_TOKEN } : {}) };
  const signals = [];
  for (const slug of tags) {
    try {
      const res = await http.post('https://gql.hashnode.com', JSON.stringify({ query: QUERY, variables: { slug, first: g.per_tag } }), { headers, bucket: 'hashnode' });
      if (res.errors?.length) throw new Error(res.errors[0].message);
      const edges = res.data?.tag?.posts?.edges ?? [];
      let n = 0;
      for (const { node: p } of edges) {
        if (!p || !within(p.publishedAt, g.within_days) || (p.reactionCount ?? 0) < g.min_reactions) continue;
        const a = p.author || {};
        const s = a.socialMediaLinks || {};
        const keys = [
          a.username && `hashnode:${a.username.toLowerCase()}`,
          ...identityKeysFromUrl(s.github),
          ...identityKeysFromUrl(s.twitter),
          ...identityKeysFromUrl(s.website),
        ];
        signals.push(
          postSignal({
            platform: 'hashnode',
            keys,
            name: a.name,
            title: p.title,
            url: p.url,
            published: p.publishedAt,
            engagement: (p.reactionCount ?? 0) + 2 * (p.responseCount ?? 0),
            engagementLabel: 'reactions+2×responses',
            tags: (p.tags || []).map((t) => t.slug),
            topics,
          }),
        );
        n++;
      }
      log(`    hashnode #${slug}`.padEnd(46) + ` ${n} posts`);
    } catch (e) {
      warn(`hashnode #${slug}: ${e.message}`);
    }
  }
  return signals;
}
