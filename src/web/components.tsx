import { Eye, EyeOff, Maximize, Minimize } from 'lucide-react';
import { createContext, use, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type FormEvent, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { Account, DailyEquity, EventRecord, Health, Limit, MarketSession, Mode, Position, Severity, Strategy, StrategyState } from '../shared/domain.ts';
import { atET, et } from '../shared/et.ts';
import { calendarDate, changePercent, count, duration, etTime, glyph, localClock, money, pct, signedMoney, tone, type Tone } from '../shared/format.ts';
import { DAILY_RANGES, rangeCloses, type RangeId } from '../shared/ranges.ts';
import { DEMO, HEARTBEAT_STALE_MS, sendCommand, useDailyHistory, usePost } from './data.ts';

export const toneClass: Record<Tone, string> = { up: 'pw-up', down: 'pw-down', flat: 'pw-flat' };

export function ModeStrip({ mode }: { mode: Mode | null }) {
  if (DEMO) return <div className="pw-mode pw-mode-paper pw-small">Demo with sample data. Nothing trades.</div>;
  if (!mode)
    return (
      <div className="pw-mode pw-mode-neutral pw-small" translate="no">
        Pitwall
      </div>
    );
  return <div className={`pw-mode pw-mode-${mode} pw-small`}>{mode === 'paper' ? 'Paper trading. No real money.' : 'Live trading with real money.'}</div>;
}

export type FlagKind = 'green' | 'yellow' | 'red' | 'chequered' | 'none';
export type TrackStatus = { kind: FlagKind; text: string; detail?: string; review?: boolean };

/** The one line that says how the session is going, in flag terms a pit wall would use. */
export function trackStatus(input: { strategies: Strategy[]; market: MarketSession; stale: boolean; heartbeatAgeMs: number } | null): TrackStatus {
  if (!input) return { kind: 'none', text: 'Connecting to the engine…' };
  const { strategies, market, stale, heartbeatAgeMs } = input;
  const halted = strategies.flatMap((s) => (s.state.kind === 'halted' ? [s.state] : []));
  const paused = strategies.filter((s) => s.state.kind === 'paused').length;
  const first = halted[0];
  if (first) return { kind: 'red', text: `${count(halted.length, 'strategy', 'strategies')} halted at ${localClock(first.at)}.`, detail: first.reason, review: true };
  if (stale) {
    if (!Number.isFinite(heartbeatAgeMs)) return { kind: 'yellow', text: 'No engine data yet.', detail: 'Figures are frozen. Stop still works.' };
    return { kind: 'yellow', text: 'No engine data.', detail: `Last heartbeat ${duration(heartbeatAgeMs / 1000)} ago. Figures are frozen. Stop still works.` };
  }
  if (strategies.length > 0 && paused === strategies.length) return { kind: 'yellow', text: 'All strategies paused.', detail: 'Nothing trades until you turn one back on.', review: true };
  if (paused > 0) return { kind: 'yellow', text: `${paused} of ${count(strategies.length, 'strategy', 'strategies')} paused.`, review: true };
  if (market.state === 'pre') return { kind: 'chequered', text: 'Pre-market.', detail: `Strategies wait for the open at ${etTime(market.nextChangeAt)}.` };
  if (market.state === 'after') return { kind: 'chequered', text: 'After-hours.', detail: 'Strategies wait for the next open.' };
  if (market.state === 'closed') return { kind: 'chequered', text: 'Market closed.', detail: 'Strategies wait for the next open.' };
  return { kind: 'green', text: `All ${count(strategies.length, 'strategy', 'strategies')} running.` };
}

export function FlagIcon({ kind }: { kind: FlagKind }) {
  if (kind === 'none') return null;
  return (
    <svg className="pw-flag" viewBox="0 0 20 20" aria-hidden>
      <path className="pw-flag-pole" d="M4 2v16" />
      {kind === 'chequered' ? (
        <>
          <path className="pw-flag-cloth-outline" d="M5 3h11v8H5z" />
          <path className="pw-flag-check" d="M5 3h2.75v2.67H5zM10.5 3h2.75v2.67H10.5zM7.75 5.67h2.75v2.67H7.75zM13.25 5.67H16v2.67h-2.75zM5 8.33h2.75V11H5zM10.5 8.33h2.75V11H10.5z" />
        </>
      ) : (
        <path className="pw-flag-cloth" d="M5 3h11v8H5z" />
      )}
    </svg>
  );
}

export function TrackBand({ status }: { status: TrackStatus }) {
  return (
    <div className={`pw-track pw-track-${status.kind}`}>
      <FlagIcon kind={status.kind} />
      <p className="pw-track-text pw-label">
        <strong role="status">{status.text}</strong>
        {status.detail && <span className="pw-track-detail"> {status.detail}</span>}
      </p>
      {status.review && (
        <a className="pw-track-action pw-label" href="#/strategies">
          Review strategies
        </a>
      )}
    </div>
  );
}

const MARKET: Record<MarketSession['state'], { label: string; next: string }> = {
  open: { label: 'Open', next: 'closes' },
  pre: { label: 'Pre-market', next: 'opens' },
  after: { label: 'After-hours', next: 'ends' },
  closed: { label: 'Closed', next: 'opens' },
};

export function MarketChip({ market, now }: { market: MarketSession; now: number }) {
  const { label, next } = MARKET[market.state];
  const at = new Date(market.nextChangeAt);
  const day = et(at).date === et(new Date(now)).date ? '' : `${et(at).weekday} `;
  return (
    <span className={`pw-market pw-market-${market.state} pw-small`}>
      <span className="pw-light" aria-hidden />
      <span className="pw-market-state">{label}</span>
      <span className="pw-market-next">
        {next} {day}
        {etTime(market.nextChangeAt)}
      </span>
    </span>
  );
}

/** Full screen for a wall display, like a charting app's fullscreen mode. Shown only where the browser allows it, and from 900px. */
export function FullscreenButton() {
  const [full, setFull] = useState(() => document.fullscreenElement !== null);
  useEffect(() => {
    const sync = () => setFull(document.fullscreenElement !== null);
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);
  if (!document.fullscreenEnabled) return null;
  const Icon = full ? Minimize : Maximize;
  return (
    <button type="button" className="pw-btn pw-btn-compact pw-fullscreen" onClick={() => (full ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => {})}>
      <Icon className="pw-icon" aria-hidden />
      <span>{full ? 'Exit full screen' : 'Full screen'}</span>
    </button>
  );
}

export function SignedMoney({ value, className = 'pw-figure' }: { value: number; className?: string }) {
  const t = tone(value);
  return <span className={`pw-delta pw-amount ${className} ${toneClass[t]}`}>{`${signedMoney(value)} ${glyph(t)}`.trim()}</span>;
}

export function Screen({ title, aside, flush = false, className = '', id, children }: { title: string; aside?: ReactNode; flush?: boolean; className?: string; id?: string; children: ReactNode }) {
  const titleId = useId();
  return (
    <section id={id} className={`pw-screen ${className}`} aria-labelledby={titleId}>
      <header className="pw-screen-head">
        <h2 id={titleId} className="pw-label pw-screen-title">
          {title}
        </h2>
        {aside}
      </header>
      <div className={flush ? 'pw-screen-flush' : 'pw-screen-body'}>{children}</div>
    </section>
  );
}

export type Reading = { label: string; value: string; className?: string };

/** The figures a screen is about, on pit-board slats above its table. Each figure shrinks to fit its slat, like the hero. */
export function Readout({ cells }: { cells: Reading[] }) {
  return (
    <dl className="pw-readout">
      {cells.map((c, i) => (
        <div key={c.label} className="pw-slat">
          <dt className="pw-small pw-slat-label pw-slat-head">
            {c.label}
            {i === 0 && <PrivacyToggle />}
          </dt>
          <dd className={`pw-board pw-stat-value ${c.className ?? ''}`} style={{ '--chars': c.value.length } as CSSProperties}>
            {c.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export const signedFigure = (value: number) => `${signedMoney(value)} ${glyph(tone(value))}`.trim();

export type Figure = { label: ReactNode; value: ReactNode };

export function Figures({ rows }: { rows: Figure[] }) {
  return (
    <dl className="pw-figures">
      {rows.map((r, i) => (
        <div key={i} className="pw-figures-row">
          <dt className="pw-label">{r.label}</dt>
          <dd className="pw-figure">{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** How the account splits between each open position and cash, by market value, largest position first. */
export function Allocation({ positions, cash }: { positions: Position[]; cash: number }) {
  // shortcut: a short counts at its absolute value and margin debt as no cash; split long and short if the bots start shorting.
  const parts = [...positions.map((p) => ({ label: p.symbol, value: Math.abs(p.qty * p.lastPrice) })).sort((a, b) => b.value - a.value), { label: 'Cash', value: Math.max(0, cash) }];
  const total = parts.reduce((sum, p) => sum + p.value, 0);
  if (total <= 0) return null;
  return (
    <div className="pw-alloc">
      <div className="pw-alloc-bar" aria-hidden>
        {parts.map((p, i) => p.value > 0 && <span key={p.label} className={i === parts.length - 1 ? 'pw-alloc-cash' : ''} style={{ flexGrow: p.value }} />)}
      </div>
      <ul className="pw-alloc-key pw-small" aria-label="Allocation by market value">
        {parts.map((p, i) => (
          <li key={p.label}>
            <span className="pw-muted" translate={i === parts.length - 1 ? undefined : 'no'}>
              {p.label}
            </span>
            <span className="pw-figure">{pct((p.value / total) * 100)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const PRIVACY_KEY = 'pitwall.privacy';

export type Privacy = { hidden: boolean; toggle: () => void };
export const PrivacyContext = createContext<Privacy>({ hidden: false, toggle: () => {} });

/** Privacy mode for the shell: remembered on this device, so a wall screen or phone stays hidden after a reload. */
export function usePrivacy(): Privacy {
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem(PRIVACY_KEY) === 'hidden';
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(PRIVACY_KEY, hidden ? 'hidden' : 'shown');
    } catch {
      // Private windows can refuse storage; the mode still works until reload.
    }
  }, [hidden]);
  return { hidden, toggle: () => setHidden((h) => !h) };
}

/** The eye on the equity slat and on each readout. It blurs money and quantities for anyone looking over your shoulder; prices and percentages stay. */
export function PrivacyToggle() {
  const { hidden, toggle } = use(PrivacyContext);
  const Icon = hidden ? EyeOff : Eye;
  return (
    <button type="button" className="pw-privacy" aria-pressed={hidden} aria-label="Hide amounts" title={hidden ? 'Show amounts' : 'Hide amounts'} onClick={toggle}>
      <Icon className="pw-icon" aria-hidden />
    </button>
  );
}

const TRACE_W = 1000;
const TRACE_H = 200;

const RANGE_PRESETS = [{ id: 'today', label: 'Today' }, ...DAILY_RANGES] as const;

/** The pit board: equity, today's change and the session's reference points on stacked slats, beside the trace and its range presets. */
export function PitBoard({ account, points, events, stale }: { account: Account; points: Sample[]; events: EventRecord[]; stale: boolean }) {
  const change = account.equity - account.lastEquity;
  const changePct = account.lastEquity ? (change / account.lastEquity) * 100 : 0;
  const t = tone(change);
  const high = points.reduce<Sample | null>((best, p) => (!best || p.equity > best.equity ? p : best), null);
  const [range, setRange] = useState<RangeId>('today');
  const [asked, setAsked] = useState(0);
  const today = et(new Date()).date;
  const daily = DAILY_RANGES.find((r) => r.id === range);
  const history = useDailyHistory(daily ? today : null, asked);
  const model = !daily ? sessionModel(points, account.lastEquity, events) : history.kind === 'ready' ? rangeModel(rangeCloses(history.days, daily.start(today), today, account.equity)) : null;
  const empty = !daily
    ? 'The trace fills in as the engine records equity through the day.'
    : history.kind === 'loading'
      ? 'Loading daily closes…'
      : history.kind === 'failed'
        ? 'Daily closes did not load. Pick the range again to retry.'
        : 'Daily closes build up as the engine runs, one a day.';
  return (
    <section className="pw-board-wrap" aria-label="Equity">
      <div className="pw-slats">
        <div className="pw-slat pw-slat-hero">
          <span className="pw-small pw-slat-label pw-slat-head">
            Equity
            <PrivacyToggle />
          </span>
          <span className="pw-hero pw-stat-value pw-amount" style={{ '--chars': money(account.equity).length } as CSSProperties}>
            {money(account.equity)}
          </span>
        </div>
        <div className="pw-slat pw-slat-change">
          <span className={`pw-board pw-delta pw-amount ${toneClass[t]}`}>{t === 'flat' ? money(0) : signedMoney(change)}</span>
          <span className={`pw-label pw-delta ${toneClass[t]}`}>
            {t === 'flat' ? pct(0) : `${changePercent(changePct)} ${glyph(t)}`} today
          </span>
        </div>
        <div className="pw-slat pw-slat-pair">
          <div>
            <span className="pw-small pw-slat-label">Previous close</span>
            <span className="pw-figure pw-amount">{money(account.lastEquity)}</span>
          </div>
          <div>
            <span className="pw-small pw-slat-label">Day high</span>
            <span className={`pw-figure ${high ? 'pw-amount' : ''} ${high && high.equity > account.lastEquity ? 'pw-best' : ''}`}>{high ? money(high.equity) : 'No samples yet'}</span>
          </div>
        </div>
      </div>
      <EquityTrace model={model} empty={empty} stale={stale}>
        <div className="pw-trace-ranges" role="group" aria-label="Trace range">
          {RANGE_PRESETS.map((r) => (
            <button
              key={r.id}
              type="button"
              className="pw-trace-range pw-small"
              aria-pressed={range === r.id}
              onClick={() => {
                setRange(r.id);
                setAsked((n) => n + 1);
              }}
            >
              {r.label}
            </button>
          ))}
        </div>
      </EquityTrace>
    </section>
  );
}

type Sample = { at: string; equity: number };

/** What the trace draws: samples against a baseline across t0 to t1, its gridlines, how to read a time, the words after a change, and any flags. */
type TraceModel = { points: Sample[]; baseline: number; baselineLabel: string; t0: number; t1: number; grid: number[]; when: (iso: string) => string; since: string; flags: EventRecord[]; tags: boolean };

const FLAG_RANK: Partial<Record<Severity, number>> = { warn: 1, error: 2, halt: 3 };

/** Today: the session against the previous close, ET times, hour lines, flags and the tide-chart high and low. */
function sessionModel(points: Sample[], baseline: number, events: EventRecord[]): TraceModel | null {
  const first = points[0];
  const last = points.at(-1);
  if (!first || !last || points.length < 2) return null;
  // The axis spans the regular session, so the trace grows across the day and the empty part is the time left.
  // shortcut: early-close days still run to 16:00, Alpaca's /v2/calendar is the upgrade.
  const day = new Date(first.at);
  const t0 = Math.min(Date.parse(first.at), Date.parse(atET(day, '09:30')));
  const t1 = Math.max(Date.parse(last.at), Date.parse(atET(day, '16:00')));
  const flags = events.filter((e) => FLAG_RANK[e.severity] && Date.parse(e.at) >= t0 && Date.parse(e.at) <= t1).sort((a, b) => (FLAG_RANK[a.severity] ?? 0) - (FLAG_RANK[b.severity] ?? 0));
  const grid = [10, 11, 12, 13, 14, 15].map((h) => Date.parse(atET(day, `${h}:00`)));
  return { points, baseline, baselineLabel: 'Previous close', t0, t1, grid, when: etTime, since: 'today', flags, tags: true };
}

/** A longer range: daily closes against the first close in it, dated, with a line at each month start, or each year start past about 13 months. */
function rangeModel(closes: DailyEquity[]): TraceModel | null {
  const points = closes.map((d) => ({ at: `${d.date}T00:00:00.000Z`, equity: d.equity }));
  const first = points[0];
  const last = points.at(-1);
  if (!first || !last || points.length < 2) return null;
  const t0 = Date.parse(first.at);
  const t1 = Date.parse(last.at);
  const years = t1 - t0 > 400 * 86_400_000;
  const step = years ? 12 : 1;
  const grid: number[] = [];
  const mark = new Date(t0);
  mark.setUTCDate(1);
  if (years) mark.setUTCMonth(0);
  for (mark.setUTCMonth(mark.getUTCMonth() + step); mark.getTime() < t1; mark.setUTCMonth(mark.getUTCMonth() + step)) grid.push(mark.getTime());
  // Dates carry the year once the range crosses one, so a 1Y axis does not read Oct 29 to Oct 29.
  const when = (iso: string) => calendarDate(iso, first.at.slice(0, 4) !== last.at.slice(0, 4));
  return { points, baseline: first.equity, baselineLabel: 'First close', t0, t1, grid, when, since: `since ${when(first.at)}`, flags: [], tags: false };
}

function EquityTrace({ model, empty, stale, children }: { model: TraceModel | null; empty: string; stale: boolean; children: ReactNode }) {
  const [cursor, setCursor] = useState<number | null>(null);
  const readoutRef = useRef<HTMLSpanElement>(null);
  // The readout centres on the cursor but stops at the plot's edges. Reset first so the width is the content's.
  useLayoutEffect(() => {
    const tag = readoutRef.current;
    const plot = tag?.parentElement;
    if (!tag || !plot) return;
    tag.style.left = '0px';
    const cx = (Number(tag.dataset.x) / 100) * plot.clientWidth;
    tag.style.left = `${Math.max(0, Math.min(cx - tag.offsetWidth / 2, plot.clientWidth - tag.offsetWidth))}px`;
  });
  const first = model?.points[0];
  const last = model?.points.at(-1);
  if (!model || !first || !last) {
    return (
      <figure className="pw-trace pw-trace-empty">
        <p className="pw-label">{empty}</p>
        {children}
      </figure>
    );
  }
  const { points, baseline, t0, t1, when, since, flags } = model;
  const span = t1 - t0 || 1;
  const x = (at: string) => ((Date.parse(at) - t0) / span) * TRACE_W;
  const values = points.map((p) => p.equity);
  const lo = Math.min(...values, baseline);
  const hi = Math.max(...values, baseline);
  // Headroom above and below for the high and low labels.
  const pad = (hi - lo) * 0.4 || Math.max(1, Math.abs(baseline) * 0.001);
  const y = (v: number) => TRACE_H - ((v - (lo - pad)) / (hi - lo + 2 * pad)) * TRACE_H;
  const line = points.map((p) => `${x(p.at).toFixed(1)},${y(p.equity).toFixed(1)}`).join(' ');
  const baseY = y(baseline);
  const moved = Math.max(...values) > Math.min(...values);
  const high = points.reduce((best, p) => (p.equity > best.equity ? p : best), first);
  const low = points.reduce((worst, p) => (p.equity < worst.equity ? p : worst), first);
  const showHigh = model.tags && moved && !stale && high.equity > baseline;
  const showLow = model.tags && moved && !stale && low.equity < baseline;
  const at = (p: Sample) => ({ left: `${(x(p.at) / TRACE_W) * 100}%`, top: `${(y(p.equity) / TRACE_H) * 100}%` });
  // Near either end a label hangs inward from its dot, so it stays inside the plot.
  const edge = (p: Sample) => (x(p.at) < TRACE_W * 0.12 ? 'pw-trace-tag-start' : x(p.at) > TRACE_W * 0.88 ? 'pw-trace-tag-end' : '');
  // The cursor snaps to the nearest sample, and each flag belongs to the sample nearest it.
  const times = points.map((p) => Date.parse(p.at));
  const nearest = (t: number) => times.reduce((best, ti, i) => (Math.abs(ti - t) < Math.abs((times[best] ?? ti) - t) ? i : best), 0);
  const lastIndex = points.length - 1;
  const index = cursor === null ? null : Math.min(cursor, lastIndex);
  const shown = points[index ?? lastIndex] ?? last;
  const here = flags.filter((e) => nearest(Date.parse(e.at)) === (index ?? lastIndex));
  const worst = here.reduce<EventRecord | null>((w, e) => (!w || (FLAG_RANK[e.severity] ?? 0) > (FLAG_RANK[w.severity] ?? 0) ? e : w), null);
  const change = shown.equity - baseline;
  const scrub = (e: PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setCursor(nearest(t0 + ((e.clientX - r.left) / r.width) * span));
  };
  const step = (e: KeyboardEvent<HTMLDivElement>) => {
    const from = index ?? lastIndex;
    const to = ({ ArrowLeft: from - 1, ArrowRight: from + 1, Home: 0, End: lastIndex } as Record<string, number>)[e.key];
    if (e.key === 'Escape') setCursor(null);
    else if (to === undefined) return;
    else setCursor(Math.max(0, Math.min(to, lastIndex)));
    e.preventDefault();
  };
  return (
    <figure className={`pw-trace ${toneClass[stale ? 'flat' : tone(last.equity - baseline)]}`}>
      {/* One slot before children, as in the empty figure, so the range bar keeps its buttons and focus when a range loads. */}
      <>
        <div
          className={`pw-trace-plot ${index === null ? '' : 'pw-trace-scrubbing'}`}
          role="slider"
          tabIndex={0}
          aria-label={`Equity ${since === 'today' ? 'through the day' : since}`}
          aria-valuemin={0}
          aria-valuemax={lastIndex}
          aria-valuenow={index ?? lastIndex}
          aria-valuetext={`${when(shown.at)}, ${money(shown.equity)}, ${signedMoney(change)} ${since}${worst ? `, ${SEVERITY_WORD[worst.severity]}: ${worst.message}` : ''}`}
          onPointerDown={scrub}
          onPointerMove={scrub}
          onPointerLeave={(e) => {
            if (e.pointerType === 'mouse') setCursor(null);
          }}
          onKeyDown={step}
          onFocus={() => setCursor((c) => c ?? lastIndex)}
          onBlur={() => setCursor(null)}
        >
          <svg viewBox={`0 0 ${TRACE_W} ${TRACE_H}`} preserveAspectRatio="none" aria-hidden>
            {[0.25, 0.5, 0.75].map((f) => (
              <line key={f} className="pw-trace-grid" x1={0} x2={TRACE_W} y1={TRACE_H * f} y2={TRACE_H * f} />
            ))}
            {model.grid.map((g) => (
              <line key={g} className="pw-trace-grid" x1={x(new Date(g).toISOString())} x2={x(new Date(g).toISOString())} y1={0} y2={TRACE_H} />
            ))}
            <line className="pw-trace-base" x1={0} x2={TRACE_W} y1={baseY} y2={baseY} />
            {index !== null && <line className="pw-trace-cursor" x1={x(shown.at)} x2={x(shown.at)} y1={0} y2={TRACE_H} />}
            <polyline className="pw-trace-line" points={line} />
          </svg>
          <span className="pw-trace-now" style={at(last)} />
          {index !== null && (
            <>
              <span className="pw-trace-cursor-dot" style={at(shown)} />
              <span className="pw-trace-readout" ref={readoutRef} data-x={(x(shown.at) / TRACE_W) * 100}>
                <span className="pw-trace-readout-row">
                  <span className="pw-small">{when(shown.at)}</span>
                  <span className="pw-figure pw-amount">{money(shown.equity)}</span>
                  <span className={`pw-figure pw-amount ${toneClass[tone(change)]}`}>{signedFigure(change)}</span>
                </span>
                {worst && (
                  <span className="pw-trace-readout-event pw-small">
                    <span className={`pw-event-sev pw-sev-${worst.severity}`}>{SEVERITY_WORD[worst.severity]}</span>
                    <span className="pw-trace-readout-msg">{worst.message}</span>
                    {here.length > 1 && <span className="pw-muted">and {here.length - 1} more</span>}
                  </span>
                )}
              </span>
            </>
          )}
          {showLow && (
            <>
              <span className="pw-trace-low" style={at(low)} />
              <span className={`pw-trace-tag pw-trace-tag-below ${edge(low)}`} style={at(low)}>
                <span className="pw-figure pw-amount">{money(low.equity)}</span>
                <span className="pw-small">{when(low.at)}</span>
              </span>
            </>
          )}
          {showHigh && (
            <>
              <span className="pw-trace-high" style={at(high)} />
              <span className={`pw-trace-tag pw-trace-tag-above ${edge(high)}`} style={at(high)}>
                <span className="pw-figure pw-best pw-amount">{money(high.equity)}</span>
                <span className="pw-small">{when(high.at)}</span>
              </span>
            </>
          )}
          {/* Flags draw over the high and low labels, so a label never hides a halt. */}
          {flags.map((e) => (
            <span key={e.id} className={`pw-trace-flag pw-event-${e.severity}`} style={{ left: `${(x(e.at) / TRACE_W) * 100}%` }} />
          ))}
        </div>
        <figcaption className="pw-trace-axis pw-small" aria-hidden>
          <span>{when(new Date(t0).toISOString())}</span>
          <span className="pw-trace-legend">
            <span className="pw-trace-swatch" aria-hidden /> {model.baselineLabel}
          </span>
          <span>{when(new Date(t1).toISOString())}</span>
        </figcaption>
      </>
      {children}
    </figure>
  );
}

const SEGMENTS = 20;

export function LimitMeter({ limit }: { limit: Limit }) {
  const ratio = limit.max > 0 ? Math.min(1, limit.used / limit.max) : 0;
  // Any use lights a segment, so a limit that has started to fill never reads as empty.
  const lit = Math.ceil(ratio * SEGMENTS) / SEGMENTS;
  const level = limit.breached ? 'pw-meter-crit' : ratio >= 0.75 ? 'pw-meter-warn' : '';
  return (
    <div className={`pw-meter ${level}`}>
      <div className="pw-meter-head">
        <span className="pw-label">{limit.label}</span>
        <span className="pw-meter-pct pw-figure">{pct(ratio * 100)}</span>
      </div>
      <div className="pw-meter-track" role="meter" aria-label={limit.label} aria-valuemin={0} aria-valuemax={limit.max} aria-valuenow={limit.used} aria-valuetext={limit.detail}>
        <div className="pw-meter-fill" style={{ transform: `scaleX(${lit})` }} />
      </div>
      <div className={`pw-meter-sub pw-small ${limit.id === 'daily-loss' ? 'pw-amount' : ''}`}>{limit.detail}</div>
    </div>
  );
}

/** The engine status light. Each new heartbeat remounts the ring, so it pulses exactly when the engine reports in and stops when data goes stale. */
export function Pulse({ beat, live }: { beat: string | null; live: boolean }) {
  return (
    <span className="pw-pulse">
      <span className={`pw-light ${live ? 'pw-light-pos' : 'pw-light-warn'}`} />
      {live && beat && <span key={beat} className="pw-pulse-ring" aria-hidden />}
    </span>
  );
}

const GB = 1024 ** 3;

/** The engine's heartbeat age changes every second. Screens are memoized on the snapshot, so only readers of this context tick. */
export const HeartbeatAgeContext = createContext(Infinity);

export function SystemReadout({ health, heartbeatAt }: { health: Health; heartbeatAt: string | null }) {
  const heartbeatAgeMs = use(HeartbeatAgeContext);
  const cpu = health.cpuTempC;
  const disk = health.diskUsedPct;
  const warnLight = (on: boolean, level: 'warn' | 'neg' = 'warn') => (on ? <span className={`pw-light pw-light-${level}`} /> : null);
  const cpuWarn = Boolean(health.throttled) || (cpu !== null && cpu >= 75);
  const cells: { label: ReactNode; value: string; meter?: { ratio: number; level: string } }[] = [
    {
      label: (
        <>
          <Pulse beat={heartbeatAt} live={heartbeatAgeMs <= HEARTBEAT_STALE_MS} /> Engine
        </>
      ),
      value: Number.isFinite(heartbeatAgeMs) ? `${duration(heartbeatAgeMs / 1000)} ago` : 'silent',
    },
    {
      label: (
        <>
          <span className={`pw-light ${health.brokerConnected ? 'pw-light-pos' : 'pw-light-neg'}`} /> Broker
        </>
      ),
      value: health.brokerConnected ? 'connected' : 'down',
    },
  ];
  // The CPU meter fills toward 85°C, where a Pi 5 throttles.
  if (cpu !== null) cells.push({ label: <>{warnLight(cpuWarn)} CPU</>, value: `${cpu.toFixed(0)}°C${health.throttled ? ' throttled' : ''}`, meter: { ratio: cpu / 85, level: cpuWarn ? 'pw-meter-warn' : '' } });
  if (disk !== null)
    cells.push({
      label: <>{warnLight(disk >= 80, disk >= 95 ? 'neg' : 'warn')} Disk</>,
      value: pct(disk),
      meter: { ratio: disk / 100, level: disk >= 95 ? 'pw-meter-crit' : disk >= 80 ? 'pw-meter-warn' : '' },
    });
  cells.push(
    {
      label: 'Memory',
      value: `${(health.memUsedBytes / GB).toFixed(1)} of ${(health.memTotalBytes / GB).toFixed(0)}\u00a0GB`,
      meter: { ratio: health.memTotalBytes ? health.memUsedBytes / health.memTotalBytes : 0, level: '' },
    },
    { label: 'Uptime', value: duration(health.uptimeS) },
  );
  return (
    <dl className="pw-system" aria-label="System">
      {cells.map((c, i) => (
        <div key={i}>
          <dt className="pw-small">{c.label}</dt>
          <dd className="pw-figure">
            {c.value}
            {c.meter && (
              <span className={`pw-meter-track ${c.meter.level}`} aria-hidden>
                <span className="pw-meter-fill" style={{ transform: `scaleX(${Math.ceil(Math.min(1, c.meter.ratio) * 10) / 10})` }} />
              </span>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

const STATE_WORD: Record<StrategyState['kind'], string> = { running: 'RUNNING', paused: 'PAUSED', halted: 'HALTED' };

function TowerRow({ position, strategy, best, busy, breached, onToggle }: { position: number; strategy: Strategy; best: boolean; busy: boolean; breached: Limit[]; onToggle: () => void }) {
  const { id, symbol, state, todayPl, fillsToday } = strategy;
  // Flash and pop only after a change seen on screen, not on first paint.
  const [shownKind, setShownKind] = useState(state.kind);
  const [changed, setChanged] = useState(false);
  if (shownKind !== state.kind) {
    setShownKind(state.kind);
    setChanged(true);
  }
  return (
    <li className={`pw-tower-row pw-state-${state.kind}`} data-id={id}>
      {changed && <span key={state.kind} className={`pw-row-flash pw-row-flash-${state.kind}`} aria-hidden />}
      <span className="pw-tower-pos pw-timing">{position}</span>
      <span className="pw-tower-id pw-timing" translate="no">
        {id}
      </span>
      <SignedMoney value={todayPl} className={`pw-tower-gap pw-timing ${best ? 'pw-best' : ''}`} />
      <label className="pw-switch-hit">
        <input type="checkbox" role="switch" className="pw-switch" checked={state.kind === 'running'} aria-disabled={busy || undefined} aria-label={`${id} running`} onChange={() => busy || onToggle()} />
      </label>
      <span className="pw-tower-meta pw-small">
        <span key={state.kind} className={`pw-state pw-state-chip-${state.kind} ${changed ? 'pw-state-enter' : ''}`}>
          {STATE_WORD[state.kind]}
        </span>
        <span translate="no">{symbol}</span>
        <span>{count(fillsToday, 'fill')} today</span>
        {state.kind === 'paused' && <span>since {localClock(state.at)}</span>}
      </span>
      {state.kind === 'halted' && (
        <div className="pw-tower-reason">
          <p className="pw-small">{state.reason}</p>
          <dl className="pw-tower-halt">
            <div>
              <dt className="pw-small">Halted at</dt>
              <dd className="pw-figure">{localClock(state.at)}</dd>
            </div>
            {breached.map((l) => (
              <div key={l.id}>
                <dt className="pw-small">{l.label}</dt>
                <dd className={`pw-figure ${l.id === 'daily-loss' ? 'pw-amount' : ''}`}>{l.detail}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </li>
  );
}

/** Strategies ranked like a timing tower: by today's P&L, best first. Pausing is immediate; resuming asks first. */
export function TimingTower({ strategies, limits = [], footer }: { strategies: Strategy[]; limits?: Limit[]; footer?: ReactNode }) {
  const [pending, setPending] = useState<{ id: string; kinds: string } | null>(null);
  const [resuming, setResuming] = useState<Strategy | null>(null);
  const [error, setError] = useState<string | null>(null);
  const kinds = strategies.map((s) => s.state.kind).join();
  // A command is pending until the engine changes any strategy's state.
  if (pending && pending.kinds !== kinds) setPending(null);
  const busy = pending?.id ?? null;
  const ranked = strategies.toSorted((a, b) => b.todayPl - a.todayPl);
  const leader = ranked[0];
  const breached = limits.filter((l) => l.breached);

  // An overtake slides each row from its old place to its new one, like a timing tower. Rows are measured every
  // render so a halt reason appearing above never skews the next slide; first paint and reduced motion don't move.
  const listRef = useRef<HTMLOListElement>(null);
  const order = ranked.map((s) => s.id).join();
  const placed = useRef<{ order: string; tops: Map<string, number> } | null>(null);
  useLayoutEffect(() => {
    const rows = [...(listRef.current?.children ?? [])] as HTMLElement[];
    const tops = new Map(rows.map((r) => [r.dataset.id ?? '', r.offsetTop]));
    const before = placed.current;
    placed.current = { order, tops };
    if (!before || before.order === order || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    for (const row of rows) {
      const from = before.tops.get(row.dataset.id ?? '');
      const to = tops.get(row.dataset.id ?? '');
      if (from === undefined || to === undefined || from === to) continue;
      // The row gaining places passes over the one it overtakes.
      row.animate([{ translate: `0 ${from - to}px`, zIndex: from > to ? 1 : 0 }, { translate: '0 0', zIndex: from > to ? 1 : 0 }], { duration: 480, easing: 'cubic-bezier(.16, 1, .3, 1)' });
    }
  });

  const pause = async (s: Strategy) => {
    setPending({ id: s.id, kinds });
    setError(null);
    const result = await sendCommand({ kind: 'pause-strategy', strategyId: s.id });
    if (!result.ok) {
      setPending(null);
      setError(result.error);
    }
  };
  const titleId = useId();

  return (
    <section className="pw-tower" aria-labelledby={titleId}>
      <header className="pw-tower-head">
        <h2 id={titleId} className="pw-title">
          Strategies
        </h2>
        <span className="pw-small pw-muted">ranked by today’s P&amp;L</span>
      </header>
      {ranked.length === 0 ? (
        <Empty title="No strategies configured.">
          List them in <span translate="no">PITWALL_STRATEGIES</span> in <span translate="no">.env</span>.
        </Empty>
      ) : (
        <>
          <div className="pw-tower-cols pw-small" aria-hidden>
            <span>Pos</span>
            <span>Strategy</span>
            <span>State</span>
            <span>Today</span>
          </div>
          <ol className="pw-tower-list" ref={listRef}>
            {ranked.map((s, i) => (
              <TowerRow
                key={s.id}
                position={i + 1}
                strategy={s}
                best={s === leader && s.todayPl > 0 && ranked.length > 1}
                busy={busy === s.id}
                breached={breached}
                onToggle={() => (s.state.kind === 'running' ? pause(s) : setResuming(s))}
              />
            ))}
          </ol>
        </>
      )}
      {error && (
        <p className="pw-help-error pw-label pw-tower-error" role="alert">
          {error}
        </p>
      )}
      {footer && <div className="pw-tower-foot">{footer}</div>}
      {resuming && <ResumeSheet strategy={resuming} onClose={() => setResuming(null)} onSent={() => setPending({ id: resuming.id, kinds })} />}
    </section>
  );
}

function ResumeSheet({ strategy, onClose, onSent }: { strategy: Strategy; onClose: () => void; onSent: () => void }) {
  const { error, attempt, busy, send } = usePost(
    () => sendCommand({ kind: 'resume-strategy', strategyId: strategy.id }),
    () => {
      onSent();
      onClose();
    },
  );
  return (
    <ConfirmSheet
      title={
        <>
          Resume <span translate="no">{strategy.id}</span>?
        </>
      }
      confirmLabel="Resume"
      confirmClass="pw-btn-primary"
      busy={busy}
      error={error}
      attempt={attempt}
      onConfirm={send}
      onCancel={onClose}
    >
      {strategy.state.kind === 'halted' && <p>It was halted: {strategy.state.reason}</p>}
      <p>
        It trades <span translate="no">{strategy.symbol}</span> again on its next signal.
      </p>
    </ConfirmSheet>
  );
}

export type EventGroup = { latest: EventRecord; earliest: EventRecord; count: number };

/** Folds runs of the same message (a broker timing out every few minutes) into one row. Input and output are newest first. */
export function collapseEvents(events: EventRecord[]): EventGroup[] {
  const groups: EventGroup[] = [];
  for (const e of events) {
    const prev = groups[groups.length - 1];
    if (prev && prev.latest.message === e.message && prev.latest.severity === e.severity && prev.latest.source === e.source) {
      prev.earliest = e;
      prev.count++;
    } else groups.push({ latest: e, earliest: e, count: 1 });
  }
  return groups;
}

/** Events newer than the newest one on screen when this list first rendered. Only those animate in. */
export function useArrivals(events: EventRecord[]) {
  const [baseline] = useState(() => events.reduce((max, e) => Math.max(max, e.id), 0));
  return (e: EventRecord) => e.id > baseline;
}

const SEVERITY_WORD: Record<Severity, string> = { info: 'INFO', warn: 'WARN', error: 'ERROR', halt: 'HALT' };

export function EventRow({ group, fresh = false }: { group: EventGroup; fresh?: boolean }) {
  const { latest, earliest, count: n } = group;
  return (
    <li className={`pw-event pw-event-${latest.severity} ${fresh ? 'pw-event-new' : ''}`}>
      <span className="pw-event-time pw-small">{localClock(latest.at)}</span>
      <span className={`pw-event-sev pw-small pw-sev-${latest.severity}`}>{SEVERITY_WORD[latest.severity]}</span>
      <span className="pw-event-msg pw-body">{latest.message}</span>
      <span className="pw-event-src pw-small">{n > 1 ? `${latest.source}, ${n} times since ${localClock(earliest.at)}` : latest.source}</span>
    </li>
  );
}

export function EventLog({ events, fresh }: { events: EventGroup[]; fresh: (e: EventRecord) => boolean }) {
  return (
    <ol className="pw-events">
      {events.map((g) => (
        <EventRow key={g.latest.id} group={g} fresh={fresh(g.latest)} />
      ))}
    </ol>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="pw-empty">
      <p className="pw-label">{title}</p>
      {children && <p className="pw-label pw-muted">{children}</p>}
    </div>
  );
}

export function PasscodeInput({ value, onChange, error, attempt = 0, help }: { value: string; onChange: (v: string) => void; error: string | null; attempt?: number; help: string }) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  // Refocusing reads the label and the error again, even when the error text has not changed.
  useEffect(() => {
    if (error) input.current?.focus();
  }, [error, attempt]);
  return (
    <div className="pw-field">
      <label htmlFor={id} className="pw-label">
        Passcode
      </label>
      <input
        ref={input}
        id={id}
        name="passcode"
        className="pw-input pw-board"
        type="password"
        autoComplete="current-password"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={`${id}-help`}
      />
      <span id={`${id}-help`} className={`pw-help pw-label ${error ? 'pw-help-error' : ''}`} aria-live="polite">
        {error ?? help}
      </span>
    </div>
  );
}

export function ConfirmSheet(props: {
  title: ReactNode;
  confirmLabel: string;
  confirmClass: string;
  busy: boolean;
  error?: string | null;
  attempt?: number;
  onConfirm: () => void;
  onCancel: () => void;
  children: ReactNode;
}) {
  const { title, confirmLabel, confirmClass, busy, error, attempt, onConfirm, onCancel, children } = props;
  const titleId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const pressedOn = useRef<EventTarget | null>(null);
  // Opens once: parents re-render every second, and reopening would steal focus from the passcode field.
  // Layout cleanup closes the dialog before React removes it, so the browser returns focus to the trigger.
  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    cancelRef.current?.focus();
    return () => dialog?.close();
  }, []);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!busy) onConfirm();
  };
  return createPortal(
    <dialog
      ref={dialogRef}
      className="pw-sheet"
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
      onPointerDown={(e) => (pressedOn.current = e.target)}
      // A key still held from Hold to flatten keeps repeating into the sheet; without this it presses Cancel.
      onKeyDown={(e) => e.repeat && (e.key === 'Enter' || e.key === ' ') && e.preventDefault()}
      onClick={(e) => e.target === e.currentTarget && pressedOn.current === e.currentTarget && onCancel()}
    >
      <form className="pw-sheet-form" onSubmit={submit}>
        <h2 id={titleId} className="pw-title">
          {title}
        </h2>
        <div className="pw-body pw-sheet-body">{children}</div>
        {error && (
          <p key={attempt} className="pw-help pw-help-error pw-label" role="alert">
            {error}
          </p>
        )}
        <div className="pw-sheet-actions">
          <button ref={cancelRef} type="button" className="pw-btn" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className={`pw-btn ${confirmClass}`} disabled={busy}>
            {busy ? 'Sending…' : confirmLabel}
          </button>
        </div>
      </form>
    </dialog>,
    document.body,
  );
}

const HOLD_MS = 2_000;

export function HoldToFlatten({ onComplete }: { onComplete: () => void }) {
  const button = useRef<HTMLButtonElement>(null);
  const frame = useRef(0);
  const [holding, setHolding] = useState(false);
  const setHold = (p: number) => button.current?.style.setProperty('--hold', String(p));
  const cancel = () => {
    cancelAnimationFrame(frame.current);
    setHolding(false);
    setHold(0);
  };
  const start = () => {
    cancelAnimationFrame(frame.current);
    setHolding(true);
    const startedAt = performance.now();
    const step = (t: number) => {
      const progress = Math.min(1, (t - startedAt) / HOLD_MS);
      setHold(progress);
      if (progress < 1) frame.current = requestAnimationFrame(step);
      else {
        setHolding(false);
        setHold(0);
        onComplete();
      }
    };
    frame.current = requestAnimationFrame(step);
  };
  useEffect(() => () => cancelAnimationFrame(frame.current), []);
  return (
    <button
      ref={button}
      type="button"
      className={`pw-btn pw-btn-flatten ${holding ? 'pw-holding' : ''}`}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        start();
      }}
      onPointerUp={cancel}
      onPointerCancel={cancel}
      onClick={(e) => e.detail === 0 && onComplete()}
      onKeyDown={(e) => {
        if (e.key !== ' ' && e.key !== 'Enter') return;
        // Repeats must be prevented too, or the browser's own activation clicks through the hold.
        e.preventDefault();
        if (!e.repeat) start();
      }}
      onKeyUp={(e) => (e.key === ' ' || e.key === 'Enter') && cancel()}
      onBlur={cancel}
      onContextMenu={(e) => e.preventDefault()}
    >
      <span className="pw-hold" aria-hidden />
      <span>{holding ? 'Keep holding…' : 'Hold to flatten'}</span>
    </button>
  );
}
