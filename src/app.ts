import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { rateLimit } from './rate-limit.js';
import { isReserved, randomSlug, SLUG_PATTERN } from './slug.js';
import { SlugTakenError, type Link, type LinkStore } from './store.js';
import { page } from './ui.js';

export interface AppOptions {
  store: LinkStore;
  /** Public origin used in short URLs, e.g. https://s.example.com. Defaults to the request origin. */
  baseUrl?: string;
  rateLimit?: { limit: number; windowMs: number };
  /** Identifies the client for rate limiting. */
  clientKey?: (c: Context) => string;
}

const body = z.object({
  url: z.string().trim().min(1, 'url is required').max(2048, 'url is too long'),
  slug: z
    .string()
    .trim()
    .regex(SLUG_PATTERN, 'slug must be 3-40 letters, numbers, - or _')
    .optional()
    .or(z.literal('').transform(() => undefined)),
});

function checkUrl(raw: string, self: string): string | undefined {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return 'url must be a valid absolute URL';
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return 'url must use http or https';
  if (!url.hostname) return 'url must have a host';
  if (url.host === new URL(self).host) return 'cannot shorten links to this shortener';
  return undefined;
}

export function createApp(options: AppOptions) {
  const { store } = options;
  const app = new Hono();
  const origin = (c: Context) => options.baseUrl?.replace(/\/$/, '') ?? new URL(c.req.url).origin;
  const present = (c: Context, link: Link) => ({ ...link, shortUrl: `${origin(c)}/${link.slug}` });

  app.onError((err, c) => {
    console.error(err);
    return c.json({ error: 'internal', message: 'Something went wrong.' }, 500);
  });

  app.get('/', (c) => c.html(page));
  app.get('/healthz', (c) => c.json({ ok: true }));

  const limit = options.rateLimit ?? { limit: 30, windowMs: 60_000 };
  app.post(
    '/api/links',
    rateLimit({ ...limit, key: options.clientKey ?? (() => 'global') }),
    async (c) => {
      const json = await c.req.json().catch(() => undefined);
      const parsed = body.safeParse(json);
      if (!parsed.success) {
        const message = parsed.error.issues[0]?.message ?? 'invalid body';
        return c.json({ error: 'invalid_request', message }, 400);
      }
      const { url, slug } = parsed.data;
      const urlError = checkUrl(url, origin(c));
      if (urlError) return c.json({ error: 'invalid_url', message: urlError }, 400);

      if (slug) {
        if (isReserved(slug)) {
          return c.json({ error: 'slug_reserved', message: `"${slug}" is reserved` }, 400);
        }
        try {
          return c.json(present(c, store.create(slug, url)), 201);
        } catch (err) {
          if (err instanceof SlugTakenError) {
            return c.json({ error: 'slug_taken', message: `"${slug}" is already taken` }, 409);
          }
          throw err;
        }
      }

      // Random slugs collide rarely; retry a few times, then go longer.
      for (let attempt = 0; attempt < 5; attempt++) {
        const candidate = randomSlug(attempt < 3 ? 6 : 8);
        if (store.has(candidate)) continue;
        try {
          return c.json(present(c, store.create(candidate, url)), 201);
        } catch (err) {
          if (!(err instanceof SlugTakenError)) throw err;
        }
      }
      throw new Error('could not generate a free slug');
    },
  );

  app.get('/api/links/:slug', (c) => {
    const link = store.get(c.req.param('slug'));
    if (!link) return c.json({ error: 'not_found', message: 'No such link.' }, 404);
    return c.json(present(c, link));
  });

  app.get('/:slug', (c) => {
    const slug = c.req.param('slug');
    // HEAD requests (link previews, uptime checks) don't count as clicks.
    const link = c.req.method === 'HEAD' ? store.get(slug) : store.hit(slug);
    if (!link) return c.text('Link not found', 404);
    c.header('Cache-Control', 'private, max-age=0');
    return c.redirect(link.url, 302);
  });

  return app;
}
