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
