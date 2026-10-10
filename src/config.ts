import { z } from 'zod';

const schema = z.object({
  PORT: z.coerce.number().int().min(0).max(65535).default(3000),
  HOST: z.string().default('0.0.0.0'),
  DATABASE_PATH: z.string().min(1).default('data/shrt.db'),
  BASE_URL: z.url({ protocol: /^https?$/ }).optional(),
  RATE_LIMIT: z.coerce.number().int().positive().default(30),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  /** Read the client IP from X-Forwarded-For. Only enable behind a proxy you control. */
  TRUST_PROXY: z
    .enum(['true', 'false', '1', '0'])
    .default('false')
    .transform((v) => v === 'true' || v === '1'),
});

export type Config = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  // Treat empty values (BASE_URL= in a .env file) as unset.
  const cleaned = Object.fromEntries(Object.entries(env).filter(([, v]) => v !== ''));
  const result = schema.safeParse(cleaned);
  if (!result.success) {
    const lines = result.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Invalid environment:\n${lines.join('\n')}`);
  }
  return result.data;
}
