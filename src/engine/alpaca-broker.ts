import { z } from 'zod';
import type { Account, Position, StrategyId } from '../shared/domain.ts';
import { atET } from '../shared/et.ts';
import { strategyPrefix, type Broker, type BrokerOrder, type Clock, type OrderRequest } from './broker.ts';

const num = z.coerce.number();

const accountSchema = z
  .object({ equity: num, last_equity: num, buying_power: num, cash: num })
  .transform((a): Account => ({ equity: a.equity, lastEquity: a.last_equity, buyingPower: a.buying_power, cash: a.cash }));

const positionSchema = z
  .object({ symbol: z.string(), qty: num, avg_entry_price: num, current_price: num, unrealized_pl: num, unrealized_plpc: num })
  .transform(
    (p): Position => ({
      symbol: p.symbol,
      qty: p.qty,
      avgEntryPrice: p.avg_entry_price,
      lastPrice: p.current_price,
      unrealizedPl: p.unrealized_pl,
      unrealizedPlPct: p.unrealized_plpc * 100,
    }),
  );

const clockSchema = z
  .object({ is_open: z.boolean(), next_open: z.string(), next_close: z.string() })
  .transform((c): Clock => ({ isOpen: c.is_open, sessionOpen: atET(new Date(), '09:30'), nextOpen: new Date(c.next_open).toISOString(), nextClose: new Date(c.next_close).toISOString() }));

const orderSchema = z
  .object({
    id: z.string(),
    client_order_id: z.string(),
    symbol: z.string(),
    side: z.enum(['buy', 'sell']),
    qty: num.nullable(),
    type: z.string(),
    status: z.string(),
    filled_qty: num,
    filled_avg_price: num.nullable(),
    created_at: z.string(),
    submitted_at: z.string().nullable(),
    updated_at: z.string().nullable(),
  })
  .transform(
    (o): BrokerOrder => ({
      id: o.id,
      clientOrderId: o.client_order_id,
      symbol: o.symbol,
      side: o.side,
      qty: o.qty ?? o.filled_qty,
      type: o.type,
      status: o.status,
      filledQty: o.filled_qty,
      filledAvgPrice: o.filled_avg_price,
      submittedAt: new Date(o.submitted_at ?? o.created_at).toISOString(),
      updatedAt: new Date(o.updated_at ?? o.created_at).toISOString(),
    }),
  );

const barsSchema = z.object({ bars: z.array(z.object({ c: z.number() })).nullable() });
const errorSchema = z.object({ message: z.string() });

export class AlpacaBroker implements Broker {
  #trading: string;
  #data = 'https://data.alpaca.markets';
  #headers: Record<string, string>;

  constructor(config: { keyId: string; secretKey: string; live: boolean }) {
    this.#trading = config.live ? 'https://api.alpaca.markets' : 'https://paper-api.alpaca.markets';
    this.#headers = { 'APCA-API-KEY-ID': config.keyId, 'APCA-API-SECRET-KEY': config.secretKey, 'content-type': 'application/json' };
  }

  #fetch(url: string, init: RequestInit = {}) {
    return fetch(url, { ...init, headers: this.#headers, signal: AbortSignal.timeout(10_000) });
  }

  async #json(url: string, init?: RequestInit): Promise<unknown> {
    const res = await this.#fetch(url, init);
    if (!res.ok) throw new Error(`Alpaca ${res.status} on ${init?.method ?? 'GET'} ${new URL(url).pathname}: ${await errorMessage(res)}`);
    return res.status === 204 ? null : res.json();
  }

  async getAccount() {
    return accountSchema.parse(await this.#json(`${this.#trading}/v2/account`));
  }

  async getPositions() {
    return z.array(positionSchema).parse(await this.#json(`${this.#trading}/v2/positions`));
  }

  async getClock() {
    return clockSchema.parse(await this.#json(`${this.#trading}/v2/clock`));
  }

  async getBars(symbol: string, limit: number) {
    const start = new Date(Date.now() - 4 * 86_400_000).toISOString();
    const query = new URLSearchParams({ timeframe: '1Min', limit: String(limit), feed: 'iex', sort: 'desc', start });
    const { bars } = barsSchema.parse(await this.#json(`${this.#data}/v2/stocks/${encodeURIComponent(symbol)}/bars?${query}`));
    return (bars ?? []).map((b) => b.c).reverse();
  }

  async listOrdersSince(iso: string) {
    const query = new URLSearchParams({ status: 'all', after: iso, limit: '500', direction: 'desc' });
    return z.array(orderSchema).parse(await this.#json(`${this.#trading}/v2/orders?${query}`));
  }

  async submitOrder({ symbol, side, qty, clientOrderId }: OrderRequest): Promise<BrokerOrder> {
    const body = JSON.stringify({ symbol, side, qty: String(qty), type: 'market', time_in_force: 'day', client_order_id: clientOrderId });
    const res = await this.#fetch(`${this.#trading}/v2/orders`, { method: 'POST', body });
    if (res.ok) return orderSchema.parse(await res.json());
    if (res.status !== 403 && res.status !== 422) throw new Error(`Alpaca ${res.status} on POST /v2/orders: ${await errorMessage(res)}`);
    // Alpaca refuses some orders outright (buying power, bad qty) instead of
    // creating a rejected order. Record it as one so it counts toward the limit.
    const at = new Date().toISOString();
    return { id: `rejected-${clientOrderId}`, clientOrderId, symbol, side, qty, type: 'market', status: 'rejected', filledQty: 0, filledAvgPrice: null, submittedAt: at, updatedAt: at };
  }

  async cancelOpenOrders(strategyId?: StrategyId) {
    if (!strategyId) {
      await this.#json(`${this.#trading}/v2/orders`, { method: 'DELETE' });
      return;
    }
    const open = z.array(orderSchema).parse(await this.#json(`${this.#trading}/v2/orders?status=open&limit=500`));
    for (const o of open) {
      if (strategyPrefix(o.clientOrderId) === strategyId) await this.#json(`${this.#trading}/v2/orders/${o.id}`, { method: 'DELETE' });
    }
  }

  async closeAllPositions() {
    await this.#json(`${this.#trading}/v2/positions?cancel_orders=true`, { method: 'DELETE' });
  }
}

async function errorMessage(res: Response) {
  const text = await res.text();
  try {
    return errorSchema.parse(JSON.parse(text)).message;
  } catch {
    return text.slice(0, 200) || res.statusText;
  }
}
