const MINUS = '−';

const formatter = (options: Intl.NumberFormatOptions) => {
  const f = new Intl.NumberFormat('en-US', options);
  return (n: number) => f.format(n).replace('-', MINUS);
};

export type Tone = 'up' | 'down' | 'flat';

export function tone(n: number): Tone {
  const hundredths = Math.round(n * 100);
  return hundredths > 0 ? 'up' : hundredths < 0 ? 'down' : 'flat';
}

export const glyph = (t: Tone) => (t === 'up' ? '▲' : t === 'down' ? '▼' : '');

export const money = formatter({ style: 'currency', currency: 'USD', signDisplay: 'negative' });
export const signedMoney = formatter({ style: 'currency', currency: 'USD', signDisplay: 'exceptZero' });
export const qty = formatter({ maximumFractionDigits: 4, signDisplay: 'negative' });

const percentNumber = formatter({ minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: 'negative' });
const percentAlwaysSigned = formatter({ minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: 'always' });

export const pct = (n: number) => `${percentNumber(n)}%`;
export const signedPct = (n: number) => (tone(n) === 'flat' ? pct(0) : `${percentAlwaysSigned(n)}%`);

export function delta(change: number, changePct: number): string {
  const t = tone(change);
  if (t === 'flat') return money(0);
  return `${signedMoney(change)} ${percentAlwaysSigned(changePct)}% ${glyph(t)}`;
}

export function duration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return m ? `${h}h ${m}m` : `${h}h`;
  }
  return `${Math.floor(s / 86400)}d`;
}

const etHourMinute = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const etHourMinuteSecond = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
const localHourMinuteSecond = new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });

export const etTime = (iso: string) => `${etHourMinute.format(new Date(iso))} ET`;
export const etClock = (iso: string) => etHourMinuteSecond.format(new Date(iso));
export const localClock = (iso: string) => localHourMinuteSecond.format(new Date(iso));
