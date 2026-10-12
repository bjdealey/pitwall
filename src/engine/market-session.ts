import type { MarketSession } from '../shared/domain.ts';
import { atET, et } from '../shared/et.ts';
import type { Clock } from './broker.ts';

export function marketSession(clock: Clock, now: Date): MarketSession {
  if (clock.isOpen) return { state: 'open', nextChangeAt: clock.nextClose };
  const t = et(now);
  const opensToday = et(new Date(clock.nextOpen)).date === t.date;
  if (opensToday && t.minutes >= 4 * 60 && t.minutes < 9 * 60 + 30) return { state: 'pre', nextChangeAt: clock.nextOpen };
  // ponytail: a weekday stands in for "the market opened today", so holidays read
  // AFTER from 16:00 to 20:00 ET. Alpaca's /v2/calendar is the upgrade.
  if (!t.weekend && t.minutes >= 16 * 60 && t.minutes < 20 * 60) return { state: 'after', nextChangeAt: atET(now, '20:00') };
  return { state: 'closed', nextChangeAt: clock.nextOpen };
}
