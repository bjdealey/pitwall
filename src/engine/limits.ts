import type { Account, Limit, LimitId } from '../shared/domain.ts';
import { duration, money } from '../shared/format.ts';

export type LimitConfig = { dailyLossPct: number; maxRejections: number; brokerSilenceS: number };
export type LimitInput = { account: Account; consecutiveRejections: number; lastBrokerOkAt: Date; now: Date };

// `used > 0` keeps a zero baseline (a fresh account with lastEquity 0) from reading as breached.
const limit = (id: LimitId, label: string, used: number, max: number, detail: string): Limit => ({ id, label, used, max, detail, breached: used > 0 && used >= max });

export function evaluateLimits({ account, consecutiveRejections, lastBrokerOkAt, now }: LimitInput, config: LimitConfig): Limit[] {
  const loss = Math.max(0, account.lastEquity - account.equity);
  const maxLoss = (account.lastEquity * config.dailyLossPct) / 100;
  const silence = Math.max(0, Math.floor((now.getTime() - lastBrokerOkAt.getTime()) / 1000));
  return [
    limit('daily-loss', 'Daily loss limit', loss, maxLoss, `${money(loss)} of ${money(maxLoss)}`),
    limit('rejections', 'Rejection limit', consecutiveRejections, config.maxRejections, `${consecutiveRejections} of ${config.maxRejections} orders in a row`),
    limit('broker-silence', 'Broker silence limit', silence, config.brokerSilenceS, `${duration(silence)} of ${duration(config.brokerSilenceS)} since last reply`),
  ];
}

// Reaching the cap blocks entries only, and the dashboard lists a breached limit as a cause of a halt.
export const tradesLimit = (used: number, max: number): Limit => ({ ...limit('trades', 'Daily trade limit', used, max, `${used} of ${max} entries today`), breached: false });

export const breachReason = (l: Limit) => `${l.label} reached (${l.detail}).`;
