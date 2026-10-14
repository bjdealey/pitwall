import { createContext, use, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { Account, EventRecord, Health, Limit, MarketSession, Mode, Severity, Strategy, StrategyState } from '../shared/domain.ts';
import { et } from '../shared/et.ts';
import { changePercent, count, duration, etTime, glyph, localClock, money, pct, signedMoney, tone, type Tone } from '../shared/format.ts';
import { HEARTBEAT_STALE_MS, sendCommand, usePost } from './data.ts';

export const toneClass: Record<Tone, string> = { up: 'pw-up', down: 'pw-down', flat: 'pw-flat' };

export function ModeStrip({ mode }: { mode: Mode | null }) {
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

export function SignedMoney({ value, className = 'pw-figure' }: { value: number; className?: string }) {
  const t = tone(value);
  return <span className={`pw-delta ${className} ${toneClass[t]}`}>{`${signedMoney(value)} ${glyph(t)}`.trim()}</span>;
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

const TRACE_W = 1000;
const TRACE_H = 200;

/** The pit board: equity, today's change and the session's reference points on stacked slats, beside the day's trace. */
export function PitBoard({ account, points, stale }: { account: Account; points: { at: string; equity: number }[]; stale: boolean }) {
  const change = account.equity - account.lastEquity;
  const changePct = account.lastEquity ? (change / account.lastEquity) * 100 : 0;
  const t = tone(change);
  const high = points.reduce<{ at: string; equity: number } | null>((best, p) => (!best || p.equity > best.equity ? p : best), null);
  return (
    <section className="pw-board-wrap" aria-label="Equity">
      <div className="pw-slats">
        <div className="pw-slat pw-slat-hero">
          <span className="pw-small pw-slat-label">Equity</span>
          <span className="pw-hero pw-stat-value" style={{ '--chars': money(account.equity).length } as CSSProperties}>
            {money(account.equity)}
          </span>
        </div>
        <div className="pw-slat pw-slat-change">
          <span className={`pw-board pw-delta ${toneClass[t]}`}>{t === 'flat' ? money(0) : signedMoney(change)}</span>
          <span className={`pw-label pw-delta ${toneClass[t]}`}>
            {t === 'flat' ? pct(0) : `${changePercent(changePct)} ${glyph(t)}`} today
          </span>
        </div>
        <div className="pw-slat pw-slat-pair">
          <div>
            <span className="pw-small pw-slat-label">Previous close</span>
            <span className="pw-figure">{money(account.lastEquity)}</span>
          </div>
          <div>
            <span className="pw-small pw-slat-label">Day high</span>
            <span className={`pw-figure ${high && high.equity > account.lastEquity ? 'pw-best' : ''}`}>{high ? money(high.equity) : 'No samples yet'}</span>
          </div>
        </div>
      </div>
      <EquityTrace points={points} baseline={account.lastEquity} high={high} stale={stale} />
    </section>
  );
}

function EquityTrace({ points, baseline, high, stale }: { points: { at: string; equity: number }[]; baseline: number; high: { at: string; equity: number } | null; stale: boolean }) {
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last || points.length < 2) {
    return (
      <figure className="pw-trace pw-trace-empty">
        <p className="pw-label">The trace fills in as the engine records equity through the day.</p>
      </figure>
    );
  }
  const t0 = Date.parse(first.at);
  const span = Date.parse(last.at) - t0 || 1;
  const values = points.map((p) => p.equity);
  const lo = Math.min(...values, baseline);
  const hi = Math.max(...values, baseline);
  const pad = (hi - lo) * 0.2 || Math.max(1, Math.abs(baseline) * 0.001);
  const x = (at: string) => ((Date.parse(at) - t0) / span) * TRACE_W;
  const y = (v: number) => TRACE_H - ((v - (lo - pad)) / (hi - lo + 2 * pad)) * TRACE_H;
  const line = points.map((p) => `${x(p.at).toFixed(1)},${y(p.equity).toFixed(1)}`).join(' ');
  const baseY = y(baseline);
  const moved = Math.max(...values) > Math.min(...values);
  return (
    <figure className={`pw-trace ${toneClass[stale ? 'flat' : tone(last.equity - baseline)]}`} aria-hidden>
      <div className="pw-trace-plot">
        <svg viewBox={`0 0 ${TRACE_W} ${TRACE_H}`} preserveAspectRatio="none" aria-hidden>
          {moved && <polygon className="pw-trace-area" points={`0,${baseY} ${line} ${TRACE_W},${baseY}`} />}
          <line className="pw-trace-base" x1={0} x2={TRACE_W} y1={baseY} y2={baseY} />
          <polyline className="pw-trace-line" points={line} />
        </svg>
        {moved && high && high.equity > baseline && !stale && (
          <span className="pw-trace-high" style={{ left: `${(x(high.at) / TRACE_W) * 100}%`, top: `${(y(high.equity) / TRACE_H) * 100}%` }} title={`Day high ${money(high.equity)}`} />
        )}
      </div>
      <figcaption className="pw-trace-axis pw-small">
        <span>{etTime(first.at)}</span>
        <span className="pw-trace-legend">
          <span className="pw-trace-swatch" aria-hidden /> Previous close
        </span>
        <span>{etTime(last.at)}</span>
      </figcaption>
    </figure>
  );
}

export function LimitMeter({ limit }: { limit: Limit }) {
  const ratio = limit.max > 0 ? Math.min(1, limit.used / limit.max) : 0;
  const level = limit.breached ? 'pw-meter-crit' : ratio >= 0.75 ? 'pw-meter-warn' : '';
  return (
    <div className={`pw-meter ${level}`}>
      <div className="pw-meter-head">
        <span className="pw-label">{limit.label}</span>
        <span className="pw-meter-pct pw-figure">{pct(ratio * 100)}</span>
      </div>
      <div className="pw-meter-track" role="meter" aria-label={limit.label} aria-valuemin={0} aria-valuemax={limit.max} aria-valuenow={limit.used} aria-valuetext={limit.detail}>
        <div className="pw-meter-fill" style={{ transform: `scaleX(${ratio})` }} />
      </div>
      <div className="pw-meter-sub pw-small">{limit.detail}</div>
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
  const cells: { label: ReactNode; value: string }[] = [
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
  if (cpu !== null) cells.push({ label: <>{warnLight(Boolean(health.throttled) || cpu >= 75)} CPU</>, value: `${cpu.toFixed(0)}°C${health.throttled ? ' throttled' : ''}` });
  if (disk !== null) cells.push({ label: <>{warnLight(disk >= 80, disk >= 95 ? 'neg' : 'warn')} Disk</>, value: pct(disk) });
  cells.push({ label: 'Memory', value: `${(health.memUsedBytes / GB).toFixed(1)} of ${(health.memTotalBytes / GB).toFixed(0)}\u00a0GB` }, { label: 'Uptime', value: duration(health.uptimeS) });
  return (
    <dl className="pw-system" aria-label="System">
      {cells.map((c, i) => (
        <div key={i}>
          <dt className="pw-small">{c.label}</dt>
          <dd className="pw-figure">{c.value}</dd>
        </div>
      ))}
    </dl>
  );
}

const STATE_WORD: Record<StrategyState['kind'], string> = { running: 'RUNNING', paused: 'PAUSED', halted: 'HALTED' };

function TowerRow({ position, strategy, best, busy, onToggle }: { position: number; strategy: Strategy; best: boolean; busy: boolean; onToggle: () => void }) {
  const { id, symbol, state, todayPl, fillsToday } = strategy;
  // Flash and pop only after a change seen on screen, not on first paint.
  const [shownKind, setShownKind] = useState(state.kind);
  const [changed, setChanged] = useState(false);
  if (shownKind !== state.kind) {
    setShownKind(state.kind);
    setChanged(true);
  }
  return (
    <li className={`pw-tower-row pw-state-${state.kind}`}>
      {changed && <span key={state.kind} className={`pw-row-flash pw-row-flash-${state.kind}`} aria-hidden />}
      <span className="pw-tower-pos pw-timing">P{position}</span>
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
      {state.kind === 'halted' && <p className="pw-tower-reason pw-small">{state.reason}</p>}
    </li>
  );
}

/** Strategies ranked like a timing tower: by today's P&L, best first. Pausing is immediate; resuming asks first. */
export function TimingTower({ strategies, footer }: { strategies: Strategy[]; footer?: ReactNode }) {
  const [pending, setPending] = useState<{ id: string; kinds: string } | null>(null);
  const [resuming, setResuming] = useState<Strategy | null>(null);
  const [error, setError] = useState<string | null>(null);
  const kinds = strategies.map((s) => s.state.kind).join();
  // A command is pending until the engine changes any strategy's state.
  if (pending && pending.kinds !== kinds) setPending(null);
  const busy = pending?.id ?? null;
  const ranked = strategies.toSorted((a, b) => b.todayPl - a.todayPl);
  const leader = ranked[0];

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
        <ol className="pw-tower-list">
          {ranked.map((s, i) => (
            <TowerRow
              key={s.id}
              position={i + 1}
              strategy={s}
              best={s === leader && s.todayPl > 0 && ranked.length > 1}
              busy={busy === s.id}
              onToggle={() => (s.state.kind === 'running' ? pause(s) : setResuming(s))}
            />
          ))}
        </ol>
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
    <li className={`pw-event ${fresh ? 'pw-event-new' : ''}`}>
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
