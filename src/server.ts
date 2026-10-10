import { serve } from '@hono/node-server';
import { getConnInfo } from '@hono/node-server/conninfo';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { LinkStore } from './store.js';

const config = loadConfig();
const store = new LinkStore(config.DATABASE_PATH);

const app = createApp({
  store,
  baseUrl: config.BASE_URL,
  rateLimit: { limit: config.RATE_LIMIT, windowMs: config.RATE_LIMIT_WINDOW_MS },
  clientKey: (c) => {
    if (config.TRUST_PROXY) {
      const forwarded = c.req.header('x-forwarded-for')?.split(',')[0]?.trim();
      if (forwarded) return forwarded;
    }
    return getConnInfo(c).remote.address ?? 'unknown';
  },
});

const server = serve({ fetch: app.fetch, port: config.PORT, hostname: config.HOST }, (info) => {
  console.log(`shrt listening on http://${info.address}:${info.port}`);
});

const shutdown = () => {
  server.close(() => {
    store.close();
    process.exit(0);
  });
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
