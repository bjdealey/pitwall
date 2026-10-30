import { z } from 'zod';

export type Mode = 'paper' | 'live';
export type Severity = 'info' | 'warn' | 'error' | 'halt';
export type StrategyId = string & { readonly __brand: 'StrategyId' };

export type StrategyState =
  | { kind: 'running' }
  | { kind: 'paused'; by: 'you'; at: string }
  | { kind: 'halted'; reason: string; at: string };

export type Strategy = { id: StrategyId; symbol: string; state: StrategyState; todayPl: number; positions: number; fillsToday: number };

export type Command =
  | { kind: 'pause-all' }
  | { kind: 'flatten' }
  | { kind: 'pause-strategy'; strategyId: StrategyId }
  | { kind: 'resume-strategy'; strategyId: StrategyId };

export type MarketSession = { state: 'pre' | 'open' | 'after' | 'closed'; nextChangeAt: string };
export type Account = { equity: number; lastEquity: number; buyingPower: number; cash: number };
export type Position = { symbol: string; qty: number; avgEntryPrice: number; lastPrice: number; unrealizedPl: number; unrealizedPlPct: number };
export type Order = { id: string; strategyId: StrategyId | null; symbol: string; side: 'buy' | 'sell'; qty: number; type: string; status: string; filledQty: number; filledAvgPrice: number | null; submittedAt: string };
export type LimitId = 'daily-loss' | 'rejections' | 'broker-silence' | 'trades';
export type Limit = { id: LimitId; label: string; used: number; max: number; detail: string; breached: boolean };
export type Health = { brokerConnected: boolean; cpuTempC: number | null; throttled: boolean | null; diskUsedPct: number | null; memUsedBytes: number; memTotalBytes: number; uptimeS: number };
export type EventRecord = { id: number; at: string; severity: Severity; message: string; source: string };

export type Snapshot = {
  serverTime: string;
  mode: Mode;
  heartbeatAt: string | null;
  market: MarketSession;
  account: Account;
  equityToday: { at: string; equity: number }[];
  positions: Position[];
  orders: Order[];
  strategies: Strategy[];
  limits: Limit[];
  health: Health;
  events: EventRecord[];
};

export const strategyIdSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'strategy ids are kebab-case')
  .transform((id) => id as StrategyId);

export const commandSchema: z.ZodType<Command, unknown> = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('pause-all') }),
  z.object({ kind: z.literal('flatten') }),
  z.object({ kind: z.literal('pause-strategy'), strategyId: strategyIdSchema }),
  z.object({ kind: z.literal('resume-strategy'), strategyId: strategyIdSchema }),
]);
