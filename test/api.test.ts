import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { LinkStore } from '../src/store.js';

let store: LinkStore;
let app: ReturnType<typeof createApp>;

beforeEach(() => {
  store = new LinkStore(':memory:');
  app = createApp({ store, rateLimit: { limit: 1000, windowMs: 60_000 } });
});
afterEach(() => store.close());

interface Body {
  slug: string;
  url: string;
  shortUrl: string;
  clicks: number;
  createdAt: string;
  lastClickedAt: string | null;
  error?: string;
  message?: string;
}

const read = (res: Response) => res.json() as Promise<Body>;

const post = (body: unknown, a = app) =>
  a.request('http://sh.rt/api/links', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

describe('POST /api/links', () => {
  it('creates a link with a random slug', async () => {
    const res = await post({ url: 'https://example.com/some/long/path?q=1' });
    expect(res.status).toBe(201);
    const link = await read(res);
    expect(link).toMatchObject({
      url: 'https://example.com/some/long/path?q=1',
      clicks: 0,
      lastClickedAt: null,
    });
    expect(link.slug).toMatch(/^[A-Za-z0-9]{6}$/);
    expect(link.shortUrl).toBe(`http://sh.rt/${link.slug}`);
    expect(new Date(link.createdAt).getTime()).not.toBeNaN();
  });

  it('accepts a custom slug and treats an empty one as absent', async () => {
    expect(
      await read(await post({ url: 'https://example.com', slug: 'launch-2026' })),
    ).toMatchObject({
      slug: 'launch-2026',
    });
    const res = await post({ url: 'https://example.com', slug: '' });
    expect(res.status).toBe(201);
    expect((await read(res)).slug).toHaveLength(6);
  });

  it('rejects taken slugs, case-insensitively', async () => {
    await post({ url: 'https://a.com', slug: 'promo' });
    const res = await post({ url: 'https://b.com', slug: 'PROMO' });
    expect(res.status).toBe(409);
    expect(await read(res)).toEqual({ error: 'slug_taken', message: '"PROMO" is already taken' });
  });

  it('rejects reserved slugs', async () => {
    const res = await post({ url: 'https://a.com', slug: 'api' });
    expect(res.status).toBe(400);
    expect((await read(res)).error).toBe('slug_reserved');
  });

  it.each([
    ['a missing url', {}, 'invalid_request'],
    ['an empty url', { url: '' }, 'invalid_request'],
    ['a slug with spaces', { url: 'https://a.com', slug: 'a b' }, 'invalid_request'],
    ['a too-short slug', { url: 'https://a.com', slug: 'ab' }, 'invalid_request'],
    ['a url over 2048 chars', { url: `https://a.com/${'x'.repeat(2048)}` }, 'invalid_request'],
    ['a non-url', { url: 'not a url' }, 'invalid_url'],
    ['a javascript: url', { url: 'javascript:alert(1)' }, 'invalid_url'],
    ['an ftp url', { url: 'ftp://files.example.com' }, 'invalid_url'],
    ['a link back to itself', { url: 'http://sh.rt/abc123' }, 'invalid_url'],
    ['malformed JSON', '{not json', 'invalid_request'],
  ])('rejects %s', async (_label, body, error) => {
    const res = await post(body);
    expect(res.status).toBe(400);
    expect((await read(res)).error).toBe(error);
  });

  it('uses BASE_URL for short links when configured', async () => {
    const a = createApp({ store, baseUrl: 'https://go.example.com/' });
    const link = await read(await post({ url: 'https://example.com', slug: 'hello' }, a));
    expect(link.shortUrl).toBe('https://go.example.com/hello');
  });
});

describe('redirects and stats', () => {
  it('redirects and counts clicks', async () => {
    await post({ url: 'https://example.com/target', slug: 'go-now' });

    for (let i = 0; i < 3; i++) {
      const res = await app.request('http://sh.rt/go-now');
      expect(res.status).toBe(302);
      expect(res.headers.get('location')).toBe('https://example.com/target');
    }

    const stats = await read(await app.request('http://sh.rt/api/links/go-now'));
    expect(stats).toMatchObject({ slug: 'go-now', clicks: 3, shortUrl: 'http://sh.rt/go-now' });
    expect(stats.lastClickedAt).not.toBeNull();
  });

  it('does not count HEAD requests', async () => {
    await post({ url: 'https://example.com', slug: 'peek' });
    const res = await app.request('http://sh.rt/peek', { method: 'HEAD' });
    expect(res.status).toBe(302);
    expect(store.get('peek')?.clicks).toBe(0);
  });

  it('returns 404 for unknown slugs', async () => {
    expect((await app.request('http://sh.rt/nope')).status).toBe(404);
    const res = await app.request('http://sh.rt/api/links/nope');
    expect(res.status).toBe(404);
    expect((await read(res)).error).toBe('not_found');
  });
});

describe('pages', () => {
  it('serves the UI and a health check', async () => {
    const home = await app.request('http://sh.rt/');
    expect(home.headers.get('content-type')).toMatch(/text\/html/);
    expect(await home.text()).toContain('<title>shrt</title>');
    expect(await (await app.request('http://sh.rt/healthz')).json()).toEqual({ ok: true });
  });
});

describe('rate limiting', () => {
  it('limits link creation per client', async () => {
    const limited = createApp({
      store,
      rateLimit: { limit: 2, windowMs: 60_000 },
      clientKey: (c) => c.req.header('x-client') ?? 'anon',
    });
    const send = (client: string) =>
      limited.request('http://sh.rt/api/links', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-client': client },
        body: JSON.stringify({ url: 'https://example.com' }),
      });

    expect((await send('a')).status).toBe(201);
    const second = await send('a');
    expect(second.headers.get('ratelimit-remaining')).toBe('0');
    const third = await send('a');
    expect(third.status).toBe(429);
    expect(Number(third.headers.get('retry-after'))).toBeGreaterThan(0);
    expect((await send('b')).status).toBe(201);

    // Redirects are never limited
    const slug = (await read(await send('b'))).slug;
    expect((await limited.request(`http://sh.rt/${slug}`)).status).toBe(302);
  });
});
