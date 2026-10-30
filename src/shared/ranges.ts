import type { DailyEquity } from './domain.ts';

const monthsBack = (n: number) => (today: string) => {
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - n);
  return d.toISOString().slice(0, 10);
};

/** The trace's longer ranges, after Today: each starts on an ET date worked out from today's, and reads daily closes from there. */
export const DAILY_RANGES = [
  { id: '1m', label: '1M', start: monthsBack(1) },
  { id: '3m', label: '3M', start: monthsBack(3) },
  { id: 'ytd', label: 'YTD', start: (today: string) => `${today.slice(0, 4)}-01-01` },
  { id: '1y', label: '1Y', start: monthsBack(12) },
  { id: 'all', label: 'All', start: () => '' },
] as const;

export type RangeId = 'today' | (typeof DAILY_RANGES)[number]['id'];

/** Closes from start up to today, then today's live equity in place of its stored row, which lags the stream. */
export const rangeCloses = (days: DailyEquity[], start: string, today: string, live: number): DailyEquity[] => [...days.filter((d) => d.date >= start && d.date < today), { date: today, equity: live }];
