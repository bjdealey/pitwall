import { z } from 'zod';
import { strategyIdSchema } from './domain.ts';

const shared = {
  PITWALL_DB: z.string().default('./data/pitwall.db'),
  NTFY_URL: z.url().optional(),
};

const engineBase = z.object({
  ...shared,
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
    .refine((list) => new Set(list.map((s) => s.id)).size === list.length, 'strategy ids must be unique')
    .refine((list) => new Set(list.map((s) => s.symbol)).size === list.length, 'each symbol can have only one strategy, because exits sell the whole position'),
  PITWALL_DAILY_LOSS_PCT: z.coerce.number().positive().default(2),
  PITWALL_MAX_REJECTIONS: z.coerce.number().int().positive().default(4),
  PITWALL_BROKER_SILENCE_S: z.coerce.number().int().positive().default(30),
  PITWALL_ENTRY_DELAY_MIN: z.coerce.number().int().min(0).default(31),
  PITWALL_ENTRY_CUTOFF_MIN: z.coerce.number().int().min(0).default(30),
  PITWALL_FLAT_BEFORE_CLOSE_MIN: z.coerce.number().int().min(0).default(5),
  PITWALL_STOP_PCT: z.coerce.number().min(0.05).max(100).default(1),
  PITWALL_RISK_PCT: z.coerce.number().positive().max(100).default(1),
  PITWALL_MAX_POSITION_PCT: z.coerce.number().positive().max(100).default(75),
  PITWALL_CASH_BUFFER_PCT: z.coerce.number().min(0).max(100).default(10),
  PITWALL_MAX_TRADES_PER_DAY: z.coerce.number().int().positive().default(3),
});

export const engineEnvSchema = z.discriminatedUnion('PITWALL_BROKER', [
  engineBase.extend({ PITWALL_BROKER: z.literal('sim') }),
  engineBase.extend({
    PITWALL_BROKER: z.literal('alpaca'),
    PITWALL_LIVE: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
    ALPACA_KEY_ID: z.string({ error: 'required when PITWALL_BROKER=alpaca' }),
    ALPACA_SECRET_KEY: z.string({ error: 'required when PITWALL_BROKER=alpaca' }),
  }),
]);

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
