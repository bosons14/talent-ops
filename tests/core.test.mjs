import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { identityKeysFromUrl, matchTopics, normalizeTopic, PROJECT_ROOT } from '../lib/util.mjs';
import { parseFeed } from '../lib/feed.mjs';
import { buildCandidates } from '../lib/aggregate.mjs';
import { scoreCandidates } from '../lib/score.mjs';
import { createFixtureHttp } from '../lib/fixture-http.mjs';
import { SOURCES } from '../sources/index.mjs';
import * as github from '../sources/repos/github.mjs';
import { readPipeline, upsert, writePipeline } from '../lib/tracker.mjs';
import { renderCsv } from '../lib/report.mjs';
import { tmpdir } from 'node:os';

const cfg = JSON.parse(await readFile(join(PROJECT_ROOT, 'tests/fixtures/demo-config.json'), 'utf8'));
cfg.topics = cfg.topics.map(normalizeTopic);
const quiet = { log() {}, warn() {} };

async function collect() {
  const http = createFixtureHttp();
  const warnings = [];
  const ctx = { http, cfg, topics: cfg.topics, log() {}, warn: (m) => warnings.push(m) };
  const signals = [];
  for (const s of Object.values(SOURCES)) signals.push(...(await s.run(ctx)));
  for (const login of ['asharaman', 'meilin-ml', 'rkapoor', 'dokafor']) signals.push(...(await github.enrich(ctx, login)));
  return { signals, warnings, http };
}

test('identity keys from URLs', () => {
  assert.deepEqual(identityKeysFromUrl('https://github.com/Foo/bar'), ['gh:foo']);
  assert.deepEqual(identityKeysFromUrl('https://medium.com/@jane.doe/post-1'), ['medium:jane.doe']);
  assert.deepEqual(identityKeysFromUrl('https://medium.com/some-pub/post'), []);
  assert.deepEqual(identityKeysFromUrl('https://jane.substack.com/p/x'), ['substack:jane']);
  assert.deepEqual(identityKeysFromUrl('jane.github.io'), ['gh:jane', 'domain:jane.github.io']);
  assert.deepEqual(identityKeysFromUrl('https://www.nytimes.com/2026/a'), []);
  assert.deepEqual(identityKeysFromUrl('https://janedoe.dev/about'), ['domain:janedoe.dev']);
});

test('topic matching: word-bounded, plural-tolerant, keywords not search tags', () => {
  const topics = [normalizeTopic({ name: 'LLM agents', tags: ['llm'], keywords: ['llm agent', 'agentic'] }), normalizeTopic({ name: 'RAG', keywords: ['rag'] })];
  assert.deepEqual(matchTopics('Typed LLM agents in Python', topics), ['LLM agents']);
  assert.deepEqual(matchTopics('LLM inference tricks', topics), []); // "llm" tag alone is not on-topic
  assert.deepEqual(matchTopics('drag and drop', topics), []); // no substring hit on "rag"
  assert.deepEqual(matchTopics('A RAG toolkit', topics), ['RAG']);
});

test('feed parser handles RSS with CDATA and Atom', () => {
  const rss = parseFeed('<rss><channel><title>T</title><item><title><![CDATA[Hi &amp; bye]]></title><link>https://a.dev/x</link><dc:creator>Ann</dc:creator><category>rag</category><pubDate>Tue, 01 Sep 2026 00:00:00 GMT</pubDate></item></channel></rss>');
  assert.equal(rss.items[0].title, 'Hi & bye');
  assert.equal(rss.items[0].author, 'Ann');
  assert.deepEqual(rss.items[0].categories, ['rag']);
  const atom = parseFeed('<feed><title>B</title><entry><title>Post</title><link rel="alternate" href="https://b.dev/p"/><author><name>Bo</name></author><published>2026-09-01T00:00:00Z</published><category term="llm"/></entry></feed>');
  assert.equal(atom.items[0].link, 'https://b.dev/p');
  assert.equal(atom.items[0].author, 'Bo');
  assert.deepEqual(atom.items[0].categories, ['llm']);
});

test('sources parse fixtures and filter noise', async () => {
  const { signals } = await collect();
  const urls = signals.map((s) => s.data.url);
  assert.ok(!urls.some((u) => u?.includes('abandoned-agent')), 'archived repo dropped');
  assert.ok(!urls.some((u) => u?.includes('openai.com')), 'big-media HN link dropped');
  assert.ok(!urls.some((u) => u?.includes('newbie')), 'low-engagement dev.to post dropped');
  assert.ok(!urls.some((u) => u?.includes('weekend-links')), 'off-topic newsletter post dropped');
  assert.ok(!signals.some((s) => s.keys.includes('gh:dependabot[bot]')), 'bots dropped');
  assert.ok(!urls.some((u) => u?.includes('somegroup/tiny')), 'below min_stars dropped');
});

test('cross-platform identity linking', async () => {
  const { signals } = await collect();
  const cands = buildCandidates(signals);
  const asha = cands.find((c) => c.id === 'gh-asharaman');
  // dev.to github_username + GitHub blog field + HN link to her domain → one person
  assert.ok(asha.keys.includes('devto:asharaman'));
  assert.ok(asha.keys.includes('domain:asharaman.dev'));
  assert.ok(asha.keys.includes('twitter:asha_builds'));
  assert.ok(asha.posts.some((p) => p.platform === 'hackernews'));
  assert.ok(asha.contributions.some((k) => k.full_name === 'vectorforge/vectorforge'));
  // GitHub blog → Medium handle, and Hashnode social link → GitHub
  const mei = cands.find((c) => c.id === 'gh-meilin-ml');
  assert.ok(mei.keys.includes('medium:meilin.ml') && mei.keys.includes('hashnode:meilin'));
  // HN post on a Substack merges with the Substack feed post (same URL)
  const tomas = cands.find((c) => c.id === 'substack-tomasvidal');
  assert.equal(tomas.posts.length, 1);
  assert.equal(tomas.posts[0].engagement, 180);
  // Org repo is an org, not a person; unlinked blog is a blog
  assert.equal(cands.find((c) => c.keys.includes('ghorg:vectorforge')).kind, 'org');
  assert.equal(cands.find((c) => c.keys.includes('domain:lowlevel.systems')).kind, 'blog');
});

test('name-only matches are flagged, never merged', () => {
  const s = (k, n) => ({ kind: 'post', platform: 'x', keys: [k], name: n, data: { title: 't', url: `https://${k}` } });
  const c = buildCandidates([s('devto:a', 'Sam Lee'), s('medium:b', 'Sam Lee')]);
  assert.equal(c.length, 2);
  assert.deepEqual(c[0].possible_matches, [c[1].id]);
});

test('scoring rewards builders who also write, and explains itself', async () => {
  const { signals } = await collect();
  const people = buildCandidates(signals).filter((c) => c.kind === 'person');
  const ranked = scoreCandidates(people, cfg);
  assert.equal(ranked[0].id, 'gh-asharaman');
  assert.ok(ranked[0].why.length >= 3);
  for (const c of ranked) assert.ok(c.score >= 0 && c.score <= 100);
  const csv = renderCsv(ranked);
  assert.match(csv.split('\n')[1], /^1,gh-asharaman,Asha Raman/);
});

test('pipeline tracker round-trip', async () => {
  const f = join(tmpdir(), `pipeline-${process.pid}.md`);
  const rows = [];
  upsert(rows, { id: 'gh-a', name: 'A | B', status: 'shortlisted', role: 'SWE' });
  upsert(rows, { id: 'gh-a', status: 'contacted', notes: 'emailed' });
  await writePipeline(f, rows);
  const back = await readPipeline(f);
  assert.equal(back.length, 1);
  assert.equal(back[0].status, 'contacted');
  assert.equal(back[0].name, 'A / B');
  assert.equal(back[0].notes, 'emailed');
});

test('github builds expected search queries', async () => {
  const { http } = await collect();
  const q = http.calls.filter((u) => u.includes('/search/repositories')).map((u) => decodeURIComponent(new URL(u).searchParams.get('q')));
  assert.ok(q.some((x) => x.startsWith('topic:llm stars:>=200 pushed:>=')));
  assert.ok(q.some((x) => x.startsWith('"LLM agents" in:name,description')));
  assert.ok(http.calls.some((u) => u.includes('/repos/vectorforge/vectorforge/contributors')));
  void quiet;
});
