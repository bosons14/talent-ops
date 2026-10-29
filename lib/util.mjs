// Shared helpers: paths, config, dates, text matching, URL -> identity keys.
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Data root precedence: --data-dir flag (sets env) > TALENT_OPS_DATA_DIR > project root.
export function dataRoot() {
  const env = process.env.TALENT_OPS_DATA_DIR;
  return env ? resolve(PROJECT_ROOT, env) : PROJECT_ROOT;
}

export function paths() {
  const r = dataRoot();
  return {
    root: r,
    config: join(r, 'config', 'search.json'),
    example: join(PROJECT_ROOT, 'config', 'search.example.json'),
    data: join(r, 'data'),
    cache: join(r, 'data', 'cache'),
    runs: join(r, 'data', 'runs'),
    candidates: join(r, 'data', 'candidates.json'),
    pipeline: join(r, 'data', 'pipeline.md'),
    reports: join(r, 'reports'),
  };
}

/** Pull `--data-dir X` out of argv before parseArgs sees it. */
export function applyDataDirFlag(argv = process.argv.slice(2)) {
  const i = argv.indexOf('--data-dir');
  if (i !== -1 && argv[i + 1]) {
    process.env.TALENT_OPS_DATA_DIR = argv[i + 1];
    argv.splice(i, 2);
  }
  return argv;
}

export async function loadConfig(path) {
  const p = paths();
  const file = path ? resolve(path) : existsSync(p.config) ? p.config : p.example;
  const cfg = JSON.parse(await readFile(file, 'utf8'));
  cfg.__file = file;
  cfg.topics = (cfg.topics || []).map(normalizeTopic);
  cfg.sources = cfg.sources || {};
  cfg.filters = cfg.filters || {};
  return cfg;
}

export function normalizeTopic(t) {
  if (typeof t === 'string') t = { name: t };
  const slug = slugify(t.name);
  return {
    name: t.name,
    tags: t.tags?.length ? t.tags.map((s) => s.toLowerCase()) : [slug],
    // keywords decide whether a repo/post is ON-topic; tags are only used to query platforms.
    // Without explicit keywords, fall back to the name plus the tags.
    keywords: (t.keywords?.length ? t.keywords : [t.name, ...(t.tags || [slug])]).map((s) => s.toLowerCase()),
    query: t.query ?? t.name,
  };
}

export const slugify = (s) =>
  String(s).toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-');

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function ageDays(iso, now = Date.now()) {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? Math.max(0, (now - t) / 86400e3) : null;
}

/** Exponential decay; unknown dates count as half weight. */
export function recency(iso, halfLifeDays, now = Date.now()) {
  const d = ageDays(iso, now);
  return d == null ? 0.5 : Math.pow(0.5, d / halfLifeDays);
}

export function isoDaysAgo(days, now = Date.now()) {
  return new Date(now - days * 86400e3).toISOString().slice(0, 10);
}

export async function writeJson(file, obj) {
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(obj, null, 2));
}

export async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {
    return fallback;
  }
}

export async function listFiles(dir, ext) {
  try {
    return (await readdir(dir)).filter((f) => !ext || f.endsWith(ext)).map((f) => join(dir, f));
  } catch {
    return [];
  }
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Return names of topics whose keywords/tags appear (word-bounded) in the text. */
export function matchTopics(text, topics) {
  const t = String(text || '').toLowerCase();
  if (!t) return [];
  return topics
    .filter((tp) =>
      [...tp.keywords, ...tp.keywords.map((x) => x.replace(/-/g, ' ')), ...tp.keywords.map((x) => x.replace(/\s+/g, '-'))].some((k) =>
        new RegExp(`(^|[^a-z0-9])${escapeRe(k)}(s|es)?([^a-z0-9]|$)`).test(t),
      ),
    )
    .map((tp) => tp.name);
}

export function stripHtml(s) {
  return String(s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

export function domainOf(u) {
  try {
    const h = new URL(/^https?:\/\//i.test(u) ? u : 'https://' + u).hostname.toLowerCase();
    return h.replace(/^www\./, '');
  } catch {
    return null;
  }
}

export function cleanUrl(u) {
  try {
    const url = new URL(u);
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return u;
  }
}

// Domains that never identify a single person on their own.
export const GENERIC_DOMAINS = new Set([
  'github.com', 'gitlab.com', 'bitbucket.org', 'codeberg.org', 'gitea.com', 'medium.com', 'substack.com',
  'dev.to', 'hashnode.com', 'hashnode.dev', 'twitter.com', 'x.com', 'linkedin.com', 'youtube.com',
  'youtu.be', 'bit.ly', 'linktr.ee', 'google.com', 'docs.google.com', 'notion.site', 'arxiv.org',
  'news.ycombinator.com', 'reddit.com', 'wikipedia.org', 'en.wikipedia.org', 'nytimes.com', 'bbc.com',
  'bbc.co.uk', 'theverge.com', 'techcrunch.com', 'wired.com', 'arstechnica.com', 'bloomberg.com',
  'reuters.com', 'theguardian.com', 'wsj.com', 'ft.com', 'cnbc.com', 'forbes.com', 'economist.com',
  'washingtonpost.com', 'cnn.com', 'npr.org', 'nature.com', 'science.org', 'quantamagazine.org',
  'openai.com', 'anthropic.com', 'deepmind.google', 'blog.google', 'ai.meta.com', 'microsoft.com',
  'apple.com', 'amazon.com', 'aws.amazon.com', 'nvidia.com', 'developer.nvidia.com', 'huggingface.co',
  'stackoverflow.com', 'gist.github.com', 'npmjs.com', 'pypi.org', 'crates.io', 'docs.rs',
  'producthunt.com', 'tiktok.com', 'instagram.com', 'facebook.com', 'mastodon.social', 'bsky.app',
  'towardsdatascience.com', 'hackernoon.com', 'infoq.com', 'zdnet.com', 'theregister.com',
]);

/**
 * Map a URL to identity keys that name one person (or org).
 * Keys are namespaced, e.g. gh:login, medium:handle, substack:sub, domain:example.com.
 */
export function identityKeysFromUrl(u, extraGeneric = []) {
  if (!u) return [];
  let url;
  try {
    url = new URL(/^https?:\/\//i.test(u) ? u : 'https://' + u);
  } catch {
    return [];
  }
  const d = url.hostname.toLowerCase().replace(/^www\./, '');
  const seg = url.pathname.split('/').filter(Boolean);
  const first = seg[0]?.toLowerCase();
  if (d === 'github.com') return first ? [`gh:${first}`] : [];
  if (d === 'gitlab.com') return first ? [`gl:${first}`] : [];
  if (d === 'codeberg.org' || d === 'gitea.com') return first ? [`gitea:${d}/${first}`] : [];
  if (d === 'bitbucket.org') return first ? [`bb:${first}`] : [];
  if (d === 'dev.to') return first ? [`devto:${first}`] : [];
  if (d === 'medium.com') return first?.startsWith('@') ? [`medium:${first.slice(1)}`] : [];
  if (d === 'twitter.com' || d === 'x.com') return first && !['i', 'home', 'search'].includes(first) ? [`twitter:${first}`] : [];
  if (d.endsWith('.github.io')) return [`gh:${d.split('.')[0]}`, `domain:${d}`];
  if (d.endsWith('.substack.com')) return [`substack:${d.split('.')[0]}`];
  if (d.endsWith('.medium.com')) return [`medium:${d.split('.')[0]}`];
  if (d.endsWith('.hashnode.dev')) return [`domain:${d}`];
  if (GENERIC_DOMAINS.has(d) || extraGeneric.includes(d)) return [];
  if (d === 'linkedin.com' || d.endsWith('.linkedin.com')) return [];
  return [`domain:${d}`];
}

export function uniq(arr) {
  return [...new Set(arr.filter(Boolean))];
}

export function makeLogger(quiet = false) {
  return {
    log: (...a) => !quiet && console.log(...a),
    warn: (...a) => console.warn('  ! ' + a.join(' ')),
  };
}
