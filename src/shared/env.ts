import { z } from 'zod';
import { strategyIdSchema } from './domain.ts';

const shared = {
  PITWALL_DB: z.string().default('./data/pitwall.db'),
  NTFY_URL: z.url().optional(),
};

export const engineEnvSchema = z
  .object({
    ...shared,
    PITWALL_BROKER: z.enum(['sim', 'alpaca']).default('sim'),
    PITWALL_LIVE: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
    ALPACA_KEY_ID: z.string().optional(),
    ALPACA_SECRET_KEY: z.string().optional(),
    PITWALL_STRATEGIES: z
      .string()
      .default('sma-cross-spy:SPY')
      .transform((list) =>
        list.split(',').map((pair) => {
          const [id = '', symbol = ''] = pair.split(':').map((s) => s.trim());
          return { id, symbol };
        }),
      )
      .pipe(z.array(z.object({ id: strategyIdSchema, symbol: z.string().regex(/^[A-Z][A-Z.]*$/, 'symbols are uppercase tickers') })).min(1))
      .refine((list) => new Set(list.map((s) => s.id)).size === list.length, 'strategy ids must be unique'),
    PITWALL_DAILY_LOSS_PCT: z.coerce.number().positive().default(2),
    PITWALL_MAX_REJECTIONS: z.coerce.number().int().positive().default(4),
    PITWALL_BROKER_SILENCE_S: z.coerce.number().int().positive().default(30),
  })
  .refine((env) => env.PITWALL_BROKER === 'sim' || (env.ALPACA_KEY_ID && env.ALPACA_SECRET_KEY), {
    message: 'ALPACA_KEY_ID and ALPACA_SECRET_KEY are required when PITWALL_BROKER=alpaca',
    path: ['ALPACA_KEY_ID'],
  });

export const apiEnvSchema = z.object({
  ...shared,
  PITWALL_PASSCODE_HASH: z.string().startsWith('$argon2id$', 'set it from npm run hash-passcode'),
  PITWALL_SESSION_SECRET: z.string().min(32, 'use at least 32 random characters'),
  PORT: z.coerce.number().int().positive().default(8080),
});

export function parseEnv<T extends z.ZodType>(schema: T, env: NodeJS.ProcessEnv = process.env): z.output<T> {
  const present = Object.fromEntries(Object.entries(env).filter(([, v]) => v !== ''));
  const result = schema.safeParse(present);
  if (result.success) return result.data;
  console.error(`Invalid environment. Fix .env and restart.\n${z.prettifyError(result.error)}`);
  process.exit(1);
}
