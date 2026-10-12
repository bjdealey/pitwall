import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import type { Account, Command, Health, Limit, MarketSession, Mode, Position, Severity, Strategy, StrategyId } from './domain.ts';

export const status = sqliteTable('status', {
  id: integer().primaryKey(),
  mode: text().$type<Mode>().notNull(),
  heartbeatAt: text().notNull(),
  commandCursor: integer().notNull(),
  account: text({ mode: 'json' }).$type<Account>().notNull(),
  market: text({ mode: 'json' }).$type<MarketSession>().notNull(),
  positions: text({ mode: 'json' }).$type<Position[]>().notNull(),
  strategies: text({ mode: 'json' }).$type<Strategy[]>().notNull(),
  limits: text({ mode: 'json' }).$type<Limit[]>().notNull(),
  health: text({ mode: 'json' }).$type<Health>().notNull(),
});

export const orders = sqliteTable(
  'orders',
  {
    id: text().primaryKey(),
    clientOrderId: text().notNull(),
    strategyId: text().$type<StrategyId>(),
    symbol: text().notNull(),
    side: text().$type<'buy' | 'sell'>().notNull(),
    qty: real().notNull(),
    type: text().notNull(),
    status: text().notNull(),
    filledQty: real().notNull(),
    filledAvgPrice: real(),
    submittedAt: text().notNull(),
    updatedAt: text().notNull(),
  },
  (t) => [index('orders_submitted_at').on(t.submittedAt)],
);

export const events = sqliteTable('events', {
  id: integer().primaryKey({ autoIncrement: true }),
  at: text().notNull(),
  severity: text().$type<Severity>().notNull(),
  message: text().notNull(),
  source: text().notNull(),
});

export const equitySamples = sqliteTable('equity_samples', {
  at: text().primaryKey(),
  equity: real().notNull(),
});

export const dailyEquity = sqliteTable('daily_equity', {
  date: text().primaryKey(),
  equity: real().notNull(),
});

export const commands = sqliteTable('commands', {
  id: integer().primaryKey({ autoIncrement: true }),
  at: text().notNull(),
  kind: text().$type<Command['kind']>().notNull(),
  strategyId: text().$type<StrategyId>(),
  by: text().notNull(),
});
