import type { Account, Order, Position, StrategyId } from '../shared/domain.ts';

export type Clock = { isOpen: boolean; sessionOpen: string; nextOpen: string; nextClose: string };
export type BrokerOrder = Omit<Order, 'strategyId'> & { clientOrderId: string; updatedAt: string };
export type OrderRequest = { symbol: string; side: 'buy' | 'sell'; qty: number; clientOrderId: string };

export interface Broker {
  getAccount(): Promise<Account>;
  getPositions(): Promise<Position[]>;
  getClock(): Promise<Clock>;
  /** Closes of the most recent 1-minute bars, oldest first. */
  getBars(symbol: string, limit: number): Promise<number[]>;
  listOrdersSince(iso: string): Promise<BrokerOrder[]>;
  submitOrder(order: OrderRequest): Promise<BrokerOrder>;
  cancelOpenOrders(strategyId?: StrategyId): Promise<void>;
  closeAllPositions(): Promise<void>;
}

export const clientOrderId = (strategyId: StrategyId, now: Date) => `${strategyId}-${now.getTime()}`;

export const strategyPrefix = (clientOrderId: string) => clientOrderId.replace(/-\d+$/, '');
