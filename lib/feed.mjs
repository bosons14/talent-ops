// Minimal RSS 2.0 / Atom parser (no dependencies). Good enough for Medium, Substack,
// Hashnode, WordPress, Ghost, Hugo and Jekyll feeds.

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function decode(s) {
  if (s == null) return '';
  return String(s)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => ENT[n.toLowerCase()] ?? m)
    .trim();
}

function inner(block, tag) {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'i');
  const m = block.match(re);
  return m ? m[1] : null;
}

function all(block, tag) {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'gi');
  return [...block.matchAll(re)].map((m) => decode(m[1]));
}

export function parseFeed(xml) {
  const text = String(xml || '');
  const channelTitle = decode(inner(text.replace(/<item[\s\S]*$/i, '').replace(/<entry[\s\S]*$/i, ''), 'title'));
  let blocks = text.match(/<item[\s>][\s\S]*?<\/item>/gi);
  const atom = !blocks;
  if (atom) blocks = text.match(/<entry[\s>][\s\S]*?<\/entry>/gi) || [];

  const items = blocks.map((b) => {
    let link = decode(inner(b, 'link'));
    if (!link || atom) {
      const alt = b.match(/<link[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["']/i) || b.match(/<link[^>]*href=["']([^"']+)["']/i);
      if (alt) link = decode(alt[1]);
    }
    const authorBlock = inner(b, 'author');
    const author =
      decode(inner(b, 'dc:creator')) ||
      (authorBlock ? decode(inner(authorBlock, 'name') ?? authorBlock) : '') ||
      '';
    const categories = [
      ...all(b, 'category'),
      ...[...b.matchAll(/<category[^>]*term=["']([^"']+)["']/gi)].map((m) => decode(m[1])),
    ].filter(Boolean);
    return {
      title: decode(inner(b, 'title')),
      link,
      author: author.replace(/^[^(]*\(([^)]+)\)$/, '$1'), // "mail@x (Name)" -> Name
      published: decode(inner(b, 'pubDate') ?? inner(b, 'published') ?? inner(b, 'updated') ?? inner(b, 'dc:date')),
      categories,
      summary: decode(inner(b, 'description') ?? inner(b, 'summary') ?? '').slice(0, 2000),
    };
  });
  return { title: channelTitle, items };
}
