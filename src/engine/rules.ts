import type { Position, StrategyState } from '../shared/domain.ts';
import { isOpenOrder } from '../shared/orders.ts';
import type { BrokerOrder, Clock } from './broker.ts';

export type RuleConfig = { entryDelayMin: number; entryCutoffMin: number; flatBeforeCloseMin: number; stopPct: number; riskPct: number; maxPositionPct: number; cashBufferPct: number; maxTradesPerDay: number };
export type ExitReason = 'stop' | 'flat-by';
export type EntryInput = { clock: Clock; now: Date; entriesToday: number; lastFillAt: string | null; price: number; equity: number; cash: number; ceiling: number };
export type EntryVerdict = { qty: number } | { blocked: string };

const SAME_CROSS_COOLDOWN_MS = 60_000;

const shiftMin = (iso: string, minutes: number) => Date.parse(iso) + minutes * 60_000;

export function riskExit(state: StrategyState, position: Position | undefined, clock: Clock, now: Date, config: RuleConfig): ExitReason | null {
  if (state.kind === 'paused' || !position || position.qty <= 0) return null;
  // shortcut: fires only while the engine runs and the broker answers, upgrade to a broker-side bracket order to survive an outage.
  // lastPrice > 0 because z.coerce.number() turns a null price from Alpaca into 0, and a false stop would sell real shares.
  if (position.lastPrice > 0 && position.lastPrice <= position.avgEntryPrice * (1 - config.stopPct / 100)) return 'stop';
  return now.getTime() >= shiftMin(clock.nextClose, -config.flatBeforeCloseMin) ? 'flat-by' : null;
}

export function gateEntry(input: EntryInput, config: RuleConfig): EntryVerdict {
  const { clock, price, equity, cash, ceiling } = input;
  const now = input.now.getTime();
  if (now < shiftMin(clock.sessionOpen, config.entryDelayMin)) return { blocked: 'entry window not open yet' };
  const entriesEndMin = Math.max(config.entryCutoffMin, config.flatBeforeCloseMin);
  if (now >= shiftMin(clock.nextClose, -entriesEndMin)) return { blocked: 'entry window closed for today' };
  if (input.entriesToday >= config.maxTradesPerDay) return { blocked: `${input.entriesToday} of ${config.maxTradesPerDay} trades today` };
  if (input.lastFillAt !== null && now - Date.parse(input.lastFillAt) < SAME_CROSS_COOLDOWN_MS) return { blocked: 'cooling down after a fill' };
  if (price <= 0) return { blocked: 'no price to size from' };

  const byRisk = (equity * config.riskPct) / 100 / ((price * config.stopPct) / 100);
  const byPosition = (equity * config.maxPositionPct) / 100 / price;
  const byCash = (cash - (equity * config.cashBufferPct) / 100) / price;
  const qty = Math.floor(Math.min(ceiling, byRisk, byPosition, byCash));
  return qty < 1 ? { blocked: 'size is under 1 share' } : { qty };
}

export function entriesToday(orders: BrokerOrder[]): number {
  return orders.filter((o) => o.side === 'buy' && (o.filledQty > 0 || isOpenOrder(o))).length;
}

export function lastFillAt(orders: BrokerOrder[]): string | null {
  return orders.reduce<string | null>((latest, o) => (o.filledQty > 0 && (latest === null || o.updatedAt > latest) ? o.updatedAt : latest), null);
}
