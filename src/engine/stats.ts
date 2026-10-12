import type { BrokerOrder } from './broker.ts';

/**
 * Today's P&L of a strategy's own trades: fill cash flow plus the net shares
 * bought today marked at the last price.
 * ponytail: a position carried in from an earlier day adds nothing. Track
 * per-strategy lots if strategies start holding overnight.
 */
export function todayStats(ordersToday: BrokerOrder[], lastPrice: number | undefined) {
  let cash = 0;
  let netQty = 0;
  let fillsToday = 0;
  for (const o of ordersToday) {
    if (o.filledQty === 0 || o.filledAvgPrice === null) continue;
    fillsToday++;
    const sign = o.side === 'buy' ? 1 : -1;
    netQty += sign * o.filledQty;
    cash -= sign * o.filledQty * o.filledAvgPrice;
  }
  return { todayPl: cash + netQty * (lastPrice ?? 0), fillsToday };
}
