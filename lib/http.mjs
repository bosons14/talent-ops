// Polite HTTP client: per-bucket throttling, retries with backoff, on-disk cache.
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { sleep } from './util.mjs';

export const USER_AGENT = 'talent-ops/0.1 (open-source recruiter sourcing tool; respects rate limits)';

export class HttpError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

/**
 * @param {object} o
 * @param {string} [o.cacheDir]   where responses are cached (null disables cache)
 * @param {number} [o.ttlHours]   cache lifetime
 * @param {boolean} [o.offline]   only serve from cache
 * @param {object} [o.intervals]  min ms between calls per bucket (bucket defaults to host)
 * @param {number} [o.maxWaitMs]  longest rate-limit wait before giving up
 */
export function createHttp({ cacheDir = null, ttlHours = 24, offline = false, intervals = {}, maxWaitMs = 120000, log = () => {} } = {}) {
  const last = new Map();

  async function throttle(bucket) {
    const gap = intervals[bucket] ?? intervals.default ?? 1000;
    const wait = (last.get(bucket) ?? 0) + gap - Date.now();
    if (wait > 0) await sleep(wait);
    last.set(bucket, Date.now());
  }

  function retryDelay(res, attempt) {
    const ra = Number(res.headers.get('retry-after'));
    if (Number.isFinite(ra) && ra > 0) return ra * 1000;
    const reset = Number(res.headers.get('x-ratelimit-reset'));
    if (Number.isFinite(reset) && reset > 0) return Math.max(1000, reset * 1000 - Date.now() + 1000);
    return Math.min(30000, 2000 * 2 ** attempt);
  }

  async function request(url, { method = 'GET', headers = {}, body, as = 'json', bucket, ttl = ttlHours, retries = 3 } = {}) {
    const key = createHash('sha256').update(`${method} ${url} ${body ?? ''}`).digest('hex');
    const file = cacheDir ? join(cacheDir, key.slice(0, 2), key + '.json') : null;
    if (file) {
      try {
        const c = JSON.parse(await readFile(file, 'utf8'));
        if (offline || Date.now() - c.t < ttl * 3600e3) return c.data;
      } catch {}
    }
    if (offline) throw new HttpError(`offline mode and not cached: ${url}`, 0);

    const b = bucket ?? new URL(url).host;
    for (let attempt = 0; ; attempt++) {
      await throttle(b);
      let res;
      try {
        res = await fetch(url, {
          method,
          body,
          headers: { 'user-agent': USER_AGENT, accept: as === 'json' ? 'application/json' : '*/*', ...headers },
          signal: AbortSignal.timeout(30000),
        });
      } catch (e) {
        if (attempt < retries) {
          await sleep(2000 * 2 ** attempt);
          continue;
        }
        throw new HttpError(`network error for ${url}: ${e.cause?.code || e.message}`, 0);
      }
      const limited = res.status === 429 || (res.status === 403 && res.headers.get('x-ratelimit-remaining') === '0');
      if ((limited || res.status >= 500) && attempt < retries) {
        const d = retryDelay(res, attempt);
        if (d > maxWaitMs) {
          throw new HttpError(`rate limit on ${b}; resets in ${Math.round(d / 60000)} min (add an API token to raise limits)`, res.status);
        }
        log(`  … ${res.status} from ${b}, waiting ${Math.round(d / 1000)}s`);
        await sleep(d);
        continue;
      }
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new HttpError(`HTTP ${res.status} for ${url}: ${txt.slice(0, 160)}`, res.status);
      }
      const data = as === 'json' ? await res.json() : await res.text();
      if (file) {
        await mkdir(join(cacheDir, key.slice(0, 2)), { recursive: true });
        await writeFile(file, JSON.stringify({ t: Date.now(), url, data }));
      }
      return data;
    }
  }

  return {
    get: (url, o = {}) => request(url, o),
    post: (url, body, o = {}) => request(url, { ...o, method: 'POST', body }),
  };
}
