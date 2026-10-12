import { Clock, OctagonX } from 'lucide-react';
import { useEffect, useId, useRef, type FormEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { EventRecord, Health, Limit, MarketSession, Mode, Severity, Strategy, StrategyState } from '../shared/domain.ts';
import { et } from '../shared/et.ts';
import { delta, duration, etTime, glyph, localClock, pct, signedMoney, tone, type Tone } from '../shared/format.ts';

export const toneClass: Record<Tone, string> = { up: 'pw-up', down: 'pw-down', flat: 'pw-flat' };

export function ModeBanner({ mode }: { mode: Mode | null }) {
  if (!mode) return <div className="pw-mode pw-mode-neutral pw-figure-sm">Pitwall</div>;
  return <div className={`pw-mode pw-mode-${mode} pw-figure-sm`}>{mode}</div>;
}

const MARKET: Record<MarketSession['state'], { dot: string; next: string }> = {
  open: { dot: 'pw-dot pw-dot-pos', next: 'closes' },
  pre: { dot: 'pw-dot', next: 'opens' },
  after: { dot: 'pw-dot', next: 'ends' },
  closed: { dot: 'pw-dot pw-dot-ring', next: 'opens' },
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

export function Delta({ change, changePct }: { change: number; changePct: number }) {
  return <span className={`pw-delta pw-figure ${toneClass[tone(change)]}`}>{delta(change, changePct)}</span>;
}

export function SignedMoney({ value, className = 'pw-figure' }: { value: number; className?: string }) {
  const t = tone(value);
  return <span className={`pw-delta ${className} ${toneClass[t]}`}>{`${signedMoney(value)} ${glyph(t)}`.trim()}</span>;
}

export function StatTile({ label, value, valueClass = '', children }: { label: string; value: string; valueClass?: string; children?: ReactNode }) {
  return (
    <div className="pw-card pw-stat">
      <span className="pw-stat-label pw-caption">{label}</span>
      <span className={`pw-stat-value pw-figure-xl ${valueClass}`}>{value}</span>
      {children && <div className="pw-stat-foot">{children}</div>}
    </div>
  );
}

export function Sparkline({ points, baseline, stale }: { points: { equity: number }[]; baseline: number; stale: boolean }) {
  const W = 120;
  const H = 32;
  const values = points.map((p) => p.equity);
  if (stale || values.length < 2) {
    return (
      <svg className="pw-spark pw-flat" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden>
        <polyline points={`0,${H / 2} ${W},${H / 2}`} />
      </svg>
    );
  }
  const min = Math.min(...values, baseline);
  const max = Math.max(...values, baseline);
  const y = (v: number) => (max === min ? H / 2 : H - ((v - min) / (max - min)) * H);
  const line = values.map((v, i) => `${((i / (values.length - 1)) * W).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  return (
    <svg className={`pw-spark ${toneClass[tone((values[values.length - 1] ?? baseline) - baseline)]}`} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden>
      <line x1={0} x2={W} y1={y(baseline)} y2={y(baseline)} />
      <polyline points={line} />
    </svg>
  );
}

export function LimitMeter({ limit }: { limit: Limit }) {
  const ratio = limit.max > 0 ? Math.min(1, limit.used / limit.max) : 0;
  const level = limit.breached ? 'pw-meter-crit' : ratio > 0.75 ? 'pw-meter-warn' : '';
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

export function HealthStrip({ health, heartbeatAgeMs }: { health: Health; heartbeatAgeMs: number }) {
  const beatOk = heartbeatAgeMs <= 15_000;
  return (
    <div className="pw-health pw-figure-sm" aria-label="Health">
      <span className="pw-health-item">
        <span className={`pw-dot ${beatOk ? 'pw-dot-pos' : 'pw-dot-warn'}`} />
        heartbeat <b>{Number.isFinite(heartbeatAgeMs) ? duration(heartbeatAgeMs / 1000) : 'none'}</b>
      </span>
      <span className="pw-health-item">
        <span className={`pw-dot ${health.brokerConnected ? 'pw-dot-pos' : 'pw-dot-neg'}`} />
        broker <b>{health.brokerConnected ? 'connected' : 'disconnected'}</b>
      </span>
      {health.cpuTempC !== null && (
        <span className="pw-health-item">
          {health.throttled && <span className="pw-dot pw-dot-warn" />}
          cpu <b>{health.cpuTempC.toFixed(1)}°C</b>
          {health.throttled && <b>throttled</b>}
        </span>
      )}
      {health.diskUsedPct !== null && (
        <span className="pw-health-item">
          disk <b>{pct(health.diskUsedPct)}</b>
        </span>
      )}
      <span className="pw-health-item">
        mem <b>{`${(health.memUsedBytes / GB).toFixed(1)} / ${(health.memTotalBytes / GB).toFixed(1)} GB`}</b>
      </span>
      <span className="pw-health-item">
        up <b>{duration(health.uptimeS)}</b>
      </span>
    </div>
  );
}

const STRATEGY_TAG: Record<StrategyState['kind'], string> = { running: 'pw-tag-run', paused: 'pw-tag-quiet', halted: 'pw-tag-halt' };

export function StrategyRow({ strategy, busy, onToggle }: { strategy: Strategy; busy: boolean; onToggle: () => void }) {
  const { id, symbol, state, todayPl, fillsToday } = strategy;
  return (
    <div className="pw-strat">
      <div>
        <div className="pw-strat-name pw-figure">{id}</div>
        <div className="pw-strat-meta pw-figure-sm">
          <span className={`pw-tag ${STRATEGY_TAG[state.kind]}`}>{state.kind}</span>
          {state.kind === 'paused' && <span>by you {localClock(state.at)}</span>}
          {state.kind === 'halted' && <span className="pw-body">{state.reason}</span>}
          <span>{symbol}</span>
          <span>
            {fillsToday} {fillsToday === 1 ? 'fill' : 'fills'} today
          </span>
        </div>
      </div>
      <SignedMoney value={todayPl} />
      <label className="pw-switch-hit">
        <input type="checkbox" role="switch" className="pw-switch" checked={state.kind === 'running'} disabled={busy} aria-label={`${id} running`} onChange={onToggle} />
      </label>
    </div>
  );
}

const SEVERITY_TAG: Record<Severity, string> = { info: 'pw-tag-quiet', warn: 'pw-tag-warn', error: 'pw-tag-halt', halt: 'pw-tag-halt' };

export function EventRow({ event }: { event: EventRecord }) {
  return (
    <div className="pw-event">
      <span className="pw-event-time pw-figure-sm">{localClock(event.at)}</span>
      <span className={`pw-tag pw-figure-sm ${SEVERITY_TAG[event.severity]}`}>{event.severity}</span>
      <span className="pw-body">{event.message}</span>
      <span className="pw-event-src pw-figure-sm">{event.source}</span>
    </div>
  );
}

export function Empty({ children }: { children: string }) {
  return <p className="pw-body pw-muted">{children}</p>;
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
        <div className="pw-body pw-col">{children}</div>
        {error && <p className="pw-help pw-help-error pw-label" role="alert">{error}</p>}
        <div className="pw-sheet-actions">
          <button ref={cancelRef} type="button" className="pw-btn" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className={`pw-btn ${confirmClass}`} disabled={busy}>
            {confirmLabel}
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
  const setHold = (p: number) => button.current?.style.setProperty('--hold', String(p));
  const cancel = () => {
    cancelAnimationFrame(frame.current);
    setHold(0);
  };
  const start = () => {
    cancelAnimationFrame(frame.current);
    const startedAt = performance.now();
    const step = (t: number) => {
      const progress = Math.min(1, (t - startedAt) / HOLD_MS);
      setHold(progress);
      if (progress < 1) frame.current = requestAnimationFrame(step);
      else {
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
      className="pw-btn pw-btn-danger pw-btn-block"
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
      <span>Hold to flatten</span>
    </button>
  );
}
