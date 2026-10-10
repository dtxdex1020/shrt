import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
import { rateLimit } from '../src/rate-limit.js';
import { isReserved, randomSlug, SLUG_PATTERN } from '../src/slug.js';
import { LinkStore, SlugTakenError } from '../src/store.js';

describe('rateLimit', () => {
  it('resets after the window', async () => {
    let now = 0;
    const app = new Hono()
      .use(rateLimit({ limit: 1, windowMs: 1000, key: () => 'k', now: () => now }))
      .get('/', (c) => c.text('ok'));
    expect((await app.request('/')).status).toBe(200);
    expect((await app.request('/')).status).toBe(429);
    now = 1000;
    expect((await app.request('/')).status).toBe(200);
  });
});

describe('slugs', () => {
  it('generates unambiguous random slugs', () => {
    for (let i = 0; i < 200; i++) {
      const s = randomSlug();
      expect(s).toMatch(SLUG_PATTERN);
      expect(s).not.toMatch(/[0O1lI]/);
    }
    expect(randomSlug(10)).toHaveLength(10);
  });

  it('knows reserved words', () => {
    expect(isReserved('API')).toBe(true);
    expect(isReserved('apis')).toBe(false);
  });
});

describe('LinkStore', () => {
  it('stores, hits and rejects duplicates', () => {
    const store = new LinkStore();
    const created = store.create('abc', 'https://a.com', new Date('2026-01-01T00:00:00Z'));
    expect(created).toEqual({
      slug: 'abc',
      url: 'https://a.com',
      clicks: 0,
      createdAt: '2026-01-01T00:00:00.000Z',
      lastClickedAt: null,
    });
    expect(() => store.create('ABC', 'https://b.com')).toThrow(SlugTakenError);
    expect(store.hit('abc', new Date('2026-01-02T00:00:00Z'))).toMatchObject({
      clicks: 1,
      lastClickedAt: '2026-01-02T00:00:00.000Z',
    });
    expect(store.hit('missing')).toBeUndefined();
    store.close();
  });
});

describe('loadConfig', () => {
  it('applies defaults', () => {
    expect(loadConfig({})).toEqual({
      PORT: 3000,
      HOST: '0.0.0.0',
      DATABASE_PATH: 'data/shrt.db',
      RATE_LIMIT: 30,
      RATE_LIMIT_WINDOW_MS: 60_000,
      TRUST_PROXY: false,
    });
  });

  it('ignores empty values', () => {
    expect(loadConfig({ BASE_URL: '', PORT: '' }).PORT).toBe(3000);
  });

  it('parses values and reports every problem', () => {
    expect(
      loadConfig({ PORT: '8080', TRUST_PROXY: '1', BASE_URL: 'https://s.example.com' }),
    ).toMatchObject({
      PORT: 8080,
      TRUST_PROXY: true,
      BASE_URL: 'https://s.example.com',
    });
    expect(() => loadConfig({ PORT: 'eighty', BASE_URL: 'ftp://x' })).toThrow(
      /PORT[\s\S]*BASE_URL/,
    );
  });
});
