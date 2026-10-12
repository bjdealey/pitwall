import type { MarketSession } from '../shared/domain.ts';
import type { Clock } from './broker.ts';

const etParts = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  weekday: 'short',
  timeZoneName: 'longOffset',
});

export function et(at: Date) {
  const p = Object.fromEntries(etParts.formatToParts(at).map((part) => [part.type, part.value]));
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    minutes: Number(p.hour) * 60 + Number(p.minute),
    weekend: p.weekday === 'Sat' || p.weekday === 'Sun',
    offset: p.timeZoneName === 'GMT' ? '+00:00' : String(p.timeZoneName).slice(3),
  };
}

/** The instant of an ET wall-clock time ("HH:MM") on the ET date of `on`. */
export function atET(on: Date, hhmm: string): string {
  const { date, offset } = et(on);
  return new Date(`${date}T${hhmm}:00${offset}`).toISOString();
}

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
