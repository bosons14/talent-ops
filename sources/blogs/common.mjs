import { isoDaysAgo, matchTopics, slugify, stripHtml, uniq } from '../../lib/util.mjs';

export function within(dateStr, days) {
  const t = Date.parse(dateStr);
  return !Number.isFinite(t) || t >= Date.parse(isoDaysAgo(days));
}

export function postSignal({ platform, keys, name, title, url, published, engagement = 0, engagementLabel, tags = [], summary = '', topics }) {
  const matched = matchTopics([title, tags.join(' '), stripHtml(summary).slice(0, 600)].join(' '), topics);
  return {
    kind: 'post',
    platform,
    keys: uniq(keys),
    name: name || null,
    data: {
      title: stripHtml(title),
      url,
      published_at: Number.isFinite(Date.parse(published)) ? new Date(published).toISOString() : null,
      engagement,
      engagement_label: engagementLabel,
      tags,
      topics_matched: matched,
    },
  };
}

/** Platform-scoped author key when a feed gives only a display name. */
export const authorKey = (platform, name) => (name ? `${platform}-author:${slugify(name)}` : null);
