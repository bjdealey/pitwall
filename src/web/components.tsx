import { Clock, OctagonX } from 'lucide-react';
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { EventRecord, Health, Limit, MarketSession, Mode, Severity, Strategy, StrategyState } from '../shared/domain.ts';
import { et } from '../shared/et.ts';
import { delta, duration, etTime, glyph, localClock, money, pct, signedMoney, tone, type Tone } from '../shared/format.ts';

export const toneClass: Record<Tone, string> = { up: 'pw-up', down: 'pw-down', flat: 'pw-flat' };

export function ModeBanner({ mode }: { mode: Mode | null }) {
  if (!mode) return <div className="pw-mode pw-mode-neutral pw-figure-sm">Pitwall</div>;
  return <div className={`pw-mode pw-mode-${mode} pw-figure-sm`}>{mode === 'paper' ? 'Paper' : 'Live · real money'}</div>;
}

const MARKET: Record<MarketSession['state'], { dot: string; next: string }> = {
  open: { dot: 'pw-dot pw-dot-pos', next: 'closes' },
  pre: { dot: 'pw-dot pw-dot-ring', next: 'opens' },
  after: { dot: 'pw-dot pw-dot-ring', next: 'ends' },
  closed: { dot: 'pw-dot', next: 'opens' },
};

export function MarketChip({ market, now }: { market: MarketSession; now: number }) {
  const { dot, next } = MARKET[market.state];
  const at = new Date(market.nextChangeAt);
  const day = et(at).date === et(new Date(now)).date ? '' : `${et(at).weekday} `;
  return (
    <span className="pw-chip pw-figure-sm">
      <span className={dot} />
      {market.state.toUpperCase()}
      <span className="pw-chip-sub">
        {next} {day}
        {etTime(market.nextChangeAt)}
      </span>
    </span>
  );
}

export function StaleChip({ ageMs }: { ageMs: number }) {
  return (
    <span className="pw-chip pw-stale pw-figure-sm" role="status">
      <Clock className="pw-icon" aria-hidden />
      STALE {Number.isFinite(ageMs) ? duration(ageMs / 1000) : ''}
    </span>
  );
}

export function Delta({ change, changePct, size = 'pw-figure' }: { change: number; changePct: number; size?: string }) {
  return <span className={`pw-delta ${size} ${toneClass[tone(change)]}`}>{delta(change, changePct)}</span>;
}

export function SignedMoney({ value, className = 'pw-figure' }: { value: number; className?: string }) {
  const t = tone(value);
  return <span className={`pw-delta ${className} ${toneClass[t]}`}>{`${signedMoney(value)} ${glyph(t)}`.trim()}</span>;
}

export function Panel({ title, action, flush = false, className = '', id, children }: { title: string; action?: ReactNode; flush?: boolean; className?: string; id?: string; children: ReactNode }) {
  const titleId = useId();
  return (
    <section id={id} className={`pw-panel ${className}`} aria-labelledby={titleId}>
      <header className="pw-panel-head">
        <h2 id={titleId} className="pw-caption pw-panel-title">
          {title}
        </h2>
        {action}
      </header>
      <div className={flush ? 'pw-panel-flush' : 'pw-panel-body'}>{children}</div>
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

const CHART_W = 1000;
const CHART_H = 160;

export function EquityChart({ points, baseline, stale }: { points: { at: string; equity: number }[]; baseline: number; stale: boolean }) {
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last || points.length < 2) {
    return <p className="pw-chart-empty pw-label">The line fills in as the engine records equity through the day.</p>;
  }
  const t0 = Date.parse(first.at);
  const span = Date.parse(last.at) - t0 || 1;
  const values = points.map((p) => p.equity);
  const lo = Math.min(...values, baseline);
  const hi = Math.max(...values, baseline);
  const pad = (hi - lo) * 0.2 || Math.max(1, Math.abs(baseline) * 0.001);
  const y = (v: number) => CHART_H - ((v - (lo - pad)) / (hi - lo + 2 * pad)) * CHART_H;
  const line = points.map((p) => `${(((Date.parse(p.at) - t0) / span) * CHART_W).toFixed(1)},${y(p.equity).toFixed(1)}`).join(' ');
  const baseY = y(baseline);
  return (
    <figure className={`pw-chart ${toneClass[stale ? 'flat' : tone(last.equity - baseline)]}`}>
      <div className="pw-chart-plot">
        <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} preserveAspectRatio="none" aria-hidden>
          {Math.max(...values) > Math.min(...values) && <polygon className="pw-chart-area" points={`0,${CHART_H} ${line} ${CHART_W},${CHART_H}`} />}
          <line className="pw-chart-base" x1={0} x2={CHART_W} y1={baseY} y2={baseY} />
          <polyline className="pw-chart-line" points={line} />
        </svg>
        <span className="pw-chart-base-label pw-figure-sm" style={{ top: `${(baseY / CHART_H) * 100}%` }}>
          prev close {money(baseline)}
        </span>
      </div>
      <figcaption className="pw-chart-axis pw-figure-sm">
        <span>{etTime(first.at)}</span>
        <span>{etTime(last.at)}</span>
      </figcaption>
    </figure>
  );
}

export function LimitMeter({ limit }: { limit: Limit }) {
  const ratio = limit.max > 0 ? Math.min(1, limit.used / limit.max) : 0;
  const level = limit.breached ? 'pw-meter-crit' : ratio >= 0.75 ? 'pw-meter-warn' : '';
  return (
    <div className={level}>
      <div className="pw-meter-head">
        <span className="pw-label">{limit.label}</span>
        <span className="pw-meter-pct pw-figure-sm">{pct(ratio * 100)}</span>
      </div>
      <div className="pw-meter-track" role="meter" aria-label={limit.label} aria-valuemin={0} aria-valuemax={limit.max} aria-valuenow={limit.used} aria-valuetext={limit.detail}>
        <div className="pw-meter-fill" style={{ width: `${ratio * 100}%` }} />
      </div>
      <div className="pw-meter-sub pw-figure-sm">{limit.detail}</div>
    </div>
  );
}

const GB = 1024 ** 3;

const Dot = ({ kind }: { kind: 'pos' | 'warn' | 'neg' | null }) => (kind ? <span className={`pw-dot pw-dot-${kind}`} /> : null);

/** The engine status dot. Each new heartbeat remounts the ring, so it pulses exactly when the engine reports in and stops when data goes stale. */
export function Pulse({ beat, live }: { beat: string | null; live: boolean }) {
  return (
    <span className="pw-pulse">
      <span className={`pw-dot ${live ? 'pw-dot-pos' : 'pw-dot-warn'}`} />
      {live && beat && <span key={beat} className="pw-pulse-ring" aria-hidden />}
    </span>
  );
}

export function HealthFigures({ health, heartbeatAt, heartbeatAgeMs }: { health: Health; heartbeatAt: string | null; heartbeatAgeMs: number }) {
  const cpu = health.cpuTempC;
  const disk = health.diskUsedPct;
  const rows: Figure[] = [
    {
      label: (
        <>
          <Pulse beat={heartbeatAt} live={heartbeatAgeMs <= 15_000} />
          Engine heartbeat
        </>
      ),
      value: Number.isFinite(heartbeatAgeMs) ? `${duration(heartbeatAgeMs / 1000)} ago` : 'none',
    },
    {
      label: (
        <>
          <Dot kind={health.brokerConnected ? 'pos' : 'neg'} />
          Broker
        </>
      ),
      value: health.brokerConnected ? 'connected' : 'disconnected',
    },
  ];
  if (cpu !== null) {
    rows.push({
      label: (
        <>
          <Dot kind={health.throttled || cpu >= 75 ? 'warn' : null} />
          CPU
        </>
      ),
      value: `${cpu.toFixed(1)}°C${health.throttled ? ' throttled' : ''}`,
    });
  }
  if (disk !== null) {
    rows.push({
      label: (
        <>
          <Dot kind={disk >= 95 ? 'neg' : disk >= 80 ? 'warn' : null} />
          Disk
        </>
      ),
      value: pct(disk),
    });
  }
  rows.push({ label: 'Memory', value: `${(health.memUsedBytes / GB).toFixed(1)} / ${(health.memTotalBytes / GB).toFixed(1)} GB` }, { label: 'Uptime', value: duration(health.uptimeS) });
  return <Figures rows={rows} />;
}

const STRATEGY_TAG: Record<StrategyState['kind'], string> = { running: 'pw-tag-run', paused: 'pw-tag-quiet', halted: 'pw-tag-halt' };

export function StrategyRow({ strategy, busy, onToggle }: { strategy: Strategy; busy: boolean; onToggle: () => void }) {
  const { id, symbol, state, todayPl, fillsToday } = strategy;
  const firstKind = useRef(state.kind);
  const changed = firstKind.current !== state.kind;
  return (
    <div className="pw-strat">
      {changed && <span key={state.kind} className={`pw-strat-flash pw-strat-flash-${state.kind}`} aria-hidden />}
      <div className="pw-strat-main">
        <div className="pw-strat-title">
          <span className="pw-strat-name pw-figure">{id}</span>
          <span key={state.kind} className={`pw-tag pw-figure-sm ${STRATEGY_TAG[state.kind]} ${changed ? 'pw-tag-enter' : ''}`}>
            {state.kind}
          </span>
        </div>
        <div className="pw-strat-meta pw-figure-sm">
          <span>{symbol}</span>
          <span>
            {fillsToday} {fillsToday === 1 ? 'fill' : 'fills'} today
          </span>
          {state.kind === 'paused' && <span>paused by you {localClock(state.at)}</span>}
          {state.kind === 'halted' && <span>halted {localClock(state.at)}</span>}
        </div>
        {state.kind === 'halted' && <p className="pw-strat-reason pw-label">{state.reason}</p>}
      </div>
      <SignedMoney value={todayPl} />
      <label className="pw-switch-hit">
        <input type="checkbox" role="switch" className="pw-switch" checked={state.kind === 'running'} disabled={busy} aria-label={`${id} running`} onChange={onToggle} />
      </label>
    </div>
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

const SEVERITY_TAG: Record<Severity, string> = { info: 'pw-tag-quiet', warn: 'pw-tag-warn', error: 'pw-tag-halt', halt: 'pw-tag-halt' };

export function EventRow({ group, fresh = false }: { group: EventGroup; fresh?: boolean }) {
  const { latest, earliest, count } = group;
  return (
    <div className={`pw-event ${fresh ? 'pw-event-new' : ''}`}>
      <span className="pw-event-time pw-figure-sm">{localClock(latest.at)}</span>
      <span className={`pw-tag pw-figure-sm ${SEVERITY_TAG[latest.severity]}`}>{latest.severity}</span>
      <span className="pw-event-msg pw-body">{latest.message}</span>
      <span className="pw-event-src pw-figure-sm">
        {latest.source}
        {count > 1 && ` · ${count} times since ${localClock(earliest.at)}`}
      </span>
    </div>
  );
}

/** Events newer than the newest one on screen when this list first rendered. Only those animate in. */
export function useArrivals(events: EventRecord[]) {
  const [baseline] = useState(() => events.reduce((max, e) => Math.max(max, e.id), 0));
  return (e: EventRecord) => e.id > baseline;
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="pw-empty">
      <p className="pw-label">{title}</p>
      {children && <p className="pw-label pw-muted">{children}</p>}
    </div>
  );
}

export function PasscodeInput({ value, onChange, error, help }: { value: string; onChange: (v: string) => void; error: string | null; help: string }) {
  const id = useId();
  return (
    <div className="pw-field">
      <label htmlFor={id} className="pw-label">
        Passcode
      </label>
      <input
        id={id}
        className="pw-input pw-figure-lg"
        type="password"
        inputMode="numeric"
        autoComplete="current-password"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={`${id}-help`}
      />
      <span id={`${id}-help`} className={`pw-help pw-label ${error ? 'pw-help-error' : ''}`}>
        {error ?? help}
      </span>
    </div>
  );
}

export function ConfirmSheet(props: {
  title: string;
  confirmLabel: string;
  confirmClass: string;
  busy: boolean;
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
  children: ReactNode;
}) {
  const { title, confirmLabel, confirmClass, busy, error, onConfirm, onCancel, children } = props;
  const titleId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!busy) onConfirm();
  };
  return createPortal(
    <div className="pw-scrim pw-modal" onClick={(e) => e.target === e.currentTarget && onCancel()}>
      <form className="pw-sheet" role="dialog" aria-modal="true" aria-labelledby={titleId} onSubmit={submit}>
        <h2 id={titleId} className="pw-title">
          {title}
        </h2>
        <div className="pw-body pw-sheet-body">{children}</div>
        {error && (
          <p className="pw-help pw-help-error pw-label" role="alert">
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
    </div>,
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
      className={`pw-btn pw-btn-danger pw-btn-block ${holding ? 'pw-holding' : ''}`}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        start();
      }}
      onPointerUp={cancel}
      onPointerCancel={cancel}
      onKeyDown={(e) => {
        if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
          e.preventDefault();
          start();
        }
      }}
      onKeyUp={(e) => (e.key === ' ' || e.key === 'Enter') && cancel()}
      onBlur={cancel}
      onContextMenu={(e) => e.preventDefault()}
    >
      <span className="pw-hold" aria-hidden />
      <OctagonX className="pw-icon" aria-hidden />
      <span>{holding ? 'Keep holding…' : 'Hold to flatten'}</span>
    </button>
  );
}
