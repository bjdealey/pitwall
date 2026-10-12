import { randomUUID } from 'node:crypto';
import type { Account, Position } from '../shared/domain.ts';
import type { Broker, BrokerOrder, Clock, OrderRequest } from './broker.ts';
import { atET } from '../shared/et.ts';

const START_CASH = 50_000;
const BAR_MS = 5_000;
const HISTORY = 200;

function seededRandom(seed: string) {
  let a = 2166136261;
  for (const ch of seed) a = Math.imul(a ^ ch.charCodeAt(0), 16777619);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Walk = { closes: number[]; random: () => number; lastBarAt: number };

const nextClose = (price: number, random: () => number) => Math.round(price * (1 + (random() - 0.5) * 0.004) * 100) / 100;

export class SimBroker implements Broker {
  #walks = new Map<string, Walk>();
  #cash = START_CASH;
  #holdings = new Map<string, { qty: number; avgEntryPrice: number }>();
  #orders: BrokerOrder[] = [];

  #closes(symbol: string): number[] {
    const now = Date.now();
    let walk = this.#walks.get(symbol);
    if (!walk) {
      const random = seededRandom(symbol);
      const closes = [Math.round((50 + random() * 450) * 100) / 100];
      while (closes.length < HISTORY) closes.push(nextClose(closes[closes.length - 1] ?? 0, random));
      walk = { closes, random, lastBarAt: now };
      this.#walks.set(symbol, walk);
    }
    for (; now - walk.lastBarAt >= BAR_MS; walk.lastBarAt += BAR_MS) walk.closes.push(nextClose(walk.closes[walk.closes.length - 1] ?? 0, walk.random));
    walk.closes.splice(0, walk.closes.length - HISTORY);
    return walk.closes;
  }

  #price(symbol: string) {
    const closes = this.#closes(symbol);
    return closes[closes.length - 1] ?? 0;
  }

  async getAccount(): Promise<Account> {
    let marketValue = 0;
    for (const [symbol, h] of this.#holdings) marketValue += h.qty * this.#price(symbol);
    return { equity: this.#cash + marketValue, lastEquity: START_CASH, buyingPower: this.#cash, cash: this.#cash };
  }

  async getPositions(): Promise<Position[]> {
    return [...this.#holdings].map(([symbol, h]) => {
      const lastPrice = this.#price(symbol);
      return {
        symbol,
        qty: h.qty,
        avgEntryPrice: h.avgEntryPrice,
        lastPrice,
        unrealizedPl: (lastPrice - h.avgEntryPrice) * h.qty,
        unrealizedPlPct: (lastPrice / h.avgEntryPrice - 1) * 100,
      };
    });
  }

  async getClock(): Promise<Clock> {
    const now = new Date();
    return { isOpen: true, nextOpen: atET(new Date(now.getTime() + 86_400_000), '09:30'), nextClose: atET(now, '16:00') };
  }

  async getBars(symbol: string, limit: number): Promise<number[]> {
    return this.#closes(symbol).slice(-limit);
  }

  async listOrdersSince(iso: string): Promise<BrokerOrder[]> {
    return this.#orders.filter((o) => o.submittedAt >= iso);
  }

  async submitOrder({ symbol, side, qty, clientOrderId }: OrderRequest): Promise<BrokerOrder> {
    const price = this.#price(symbol);
    const held = this.#holdings.get(symbol) ?? { qty: 0, avgEntryPrice: 0 };
    const rejected = side === 'buy' ? qty * price > this.#cash : qty > held.qty;
    const at = new Date().toISOString();
    const order: BrokerOrder = {
      id: randomUUID(),
      clientOrderId,
      symbol,
      side,
      qty,
      type: 'market',
      status: rejected ? 'rejected' : 'filled',
      filledQty: rejected ? 0 : qty,
      filledAvgPrice: rejected ? null : price,
      submittedAt: at,
      updatedAt: at,
    };
    this.#orders.push(order);
    if (rejected) return order;

    if (side === 'buy') {
      this.#cash -= qty * price;
      this.#holdings.set(symbol, { qty: held.qty + qty, avgEntryPrice: (held.qty * held.avgEntryPrice + qty * price) / (held.qty + qty) });
    } else {
      this.#cash += qty * price;
      if (held.qty === qty) this.#holdings.delete(symbol);
      else this.#holdings.set(symbol, { ...held, qty: held.qty - qty });
    }
    return order;
  }

  async cancelOpenOrders(): Promise<void> {}

  async closeAllPositions(): Promise<void> {
    for (const [symbol, h] of [...this.#holdings]) {
      await this.submitOrder({ symbol, side: 'sell', qty: h.qty, clientOrderId: `close-all-${Date.now()}` });
    }
  }
}
