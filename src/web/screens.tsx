import { CirclePause, OctagonAlert, Pause } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Position, Snapshot, Strategy } from '../shared/domain.ts';
import { etClock, glyph, localClock, money, qty, signedPct, tone } from '../shared/format.ts';
import { isOpenOrder } from '../shared/orders.ts';
import {
  collapseEvents,
  ConfirmSheet,
  Delta,
  Empty,
  EquityChart,
  EventRow,
  Figures,
  HealthFigures,
  HoldToFlatten,
  LimitMeter,
  Panel,
  PasscodeInput,
  SignedMoney,
  StrategyRow,
  toneClass,
  useArrivals,
} from './components.tsx';
import { sendCommand } from './data.ts';

export type ScreenProps = { snapshot: Snapshot; stale: boolean; heartbeatAgeMs: number; openPauseAll: () => void };

const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const PanelLink = ({ href, children }: { href: string; children: string }) => (
  <a className="pw-panel-link pw-label" href={href}>
    {children}
  </a>
);

const shownBands = new Set<string>();

/** Slides in the first time a given halt or pause is shown this session, not on every visit to Overview. */
function Band({ bandKey, tone, icon, title, detail }: { bandKey: string; tone: 'halt' | 'quiet'; icon: ReactNode; title: string; detail: string }) {
  const [enter] = useState(() => !shownBands.has(bandKey));
  useEffect(() => {
    shownBands.add(bandKey);
  }, [bandKey]);
  const review = () => document.getElementById('strategies')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  return (
    <div className={`pw-band ${tone === 'halt' ? 'pw-band-halt' : ''} ${enter ? 'pw-band-enter' : ''}`} role={tone === 'halt' ? 'alert' : 'status'}>
      {icon}
      <div className="pw-band-text">
        <p className="pw-label pw-band-title">{title}</p>
        <p className="pw-label pw-band-detail">{detail}</p>
      </div>
      <button type="button" className="pw-btn pw-btn-compact" onClick={review}>
        Review
      </button>
    </div>
  );
}

function StatusBand({ strategies }: { strategies: Strategy[] }) {
  const halted = strategies.flatMap((s) => (s.state.kind === 'halted' ? [s.state] : []));
  const paused = strategies.flatMap((s) => (s.state.kind === 'paused' ? [s.state.at] : []));
  const first = halted[0];
  if (first) {
    const key = `halt:${first.at}`;
    return (
      <Band
        key={key}
        bandKey={key}
        tone="halt"
        icon={<OctagonAlert className="pw-icon pw-band-icon" aria-hidden />}
        title={`${count(halted.length, 'strategy', 'strategies')} halted at ${localClock(first.at)}`}
        detail={`${first.reason} Resume each one when you are ready.`}
      />
    );
  }
  if (strategies.length > 0 && paused.length === strategies.length) {
    const key = `paused:${paused.join()}`;
    return (
      <Band
        key={key}
        bandKey={key}
        tone="quiet"
        icon={<CirclePause className="pw-icon pw-band-icon" aria-hidden />}
        title="All strategies paused"
        detail="Nothing trades until you turn a strategy back on."
      />
    );
  }
  return null;
}

export function Overview({ snapshot, stale, heartbeatAgeMs, openPauseAll }: ScreenProps) {
  const { account, positions, limits, health, events, strategies, equityToday } = snapshot;
  const [flattening, setFlattening] = useState(false);
  const change = account.equity - account.lastEquity;
  const changePct = account.lastEquity ? (change / account.lastEquity) * 100 : 0;
  const unrealized = positions.reduce((sum, p) => sum + p.unrealizedPl, 0);
  const latest = collapseEvents(events).slice(0, 5);
  const arrived = useArrivals(events);

  return (
    <div className={`pw-overview ${stale ? 'pw-is-stale' : ''}`}>
      <StatusBand strategies={strategies} />

      <div className="pw-ov-col">
        <Panel title="Equity" className="pw-ov-equity">
          <div className="pw-equity-head">
            <span className="pw-figure-hero pw-stat-value">{money(account.equity)}</span>
            <span className="pw-equity-change">
              <Delta change={change} changePct={changePct} size="pw-figure-lg" />
              <span className="pw-label pw-muted">today</span>
            </span>
          </div>
          <EquityChart points={equityToday} baseline={account.lastEquity} stale={stale} />
        </Panel>

        <Panel title="Strategies" id="strategies" className="pw-ov-strategies" flush action={<PanelLink href="#/strategies">Details</PanelLink>}>
          <StrategyList strategies={strategies} />
        </Panel>

        <Panel title={`Positions · ${positions.length}`} className="pw-ov-positions" flush action={<PanelLink href="#/positions">All positions</PanelLink>}>
          {positions.length ? (
            <PositionsTable positions={positions} compact />
          ) : (
            <Empty title="No open positions.">Strategies open them on their next signal while the market is open.</Empty>
          )}
        </Panel>

        <Panel title="Latest events" className="pw-ov-events" flush action={<PanelLink href="#/events">All events</PanelLink>}>
          {latest.length ? latest.map((g) => <EventRow key={g.latest.id} group={g} fresh={arrived(g.latest)} />) : <Empty title="No events yet." />}
        </Panel>
      </div>

      <div className="pw-ov-col">
        <Panel title="Account" className="pw-ov-account">
          <Figures
            rows={[
              { label: 'Buying power', value: money(account.buyingPower) },
              { label: 'Cash', value: money(account.cash) },
              { label: 'Unrealized P&L', value: <SignedMoney value={unrealized} /> },
              { label: 'Open positions', value: String(positions.length) },
              { label: 'Previous close', value: money(account.lastEquity) },
            ]}
          />
        </Panel>

        <Panel title="Controls" className="pw-ov-controls">
          <div className="pw-controls">
            <button type="button" className="pw-btn pw-btn-stop pw-btn-block" onClick={openPauseAll}>
              <Pause className="pw-icon" aria-hidden />
              <span>Pause all</span>
            </button>
            <HoldToFlatten onComplete={() => setFlattening(true)} />
            <p className="pw-btn-hint pw-label">Hold 2s, then enter the passcode. Flatten closes every position at market.</p>
          </div>
        </Panel>

        <Panel title="Limits" className="pw-ov-limits">
          {limits.map((l) => (
            <LimitMeter key={l.id} limit={l} />
          ))}
        </Panel>

        <Panel title="System" className="pw-ov-system">
          <HealthFigures health={health} heartbeatAt={snapshot.heartbeatAt} heartbeatAgeMs={heartbeatAgeMs} />
        </Panel>
      </div>

      {flattening && <FlattenSheet snapshot={snapshot} onClose={() => setFlattening(false)} />}
    </div>
  );
}

const openOrdersLine = (snapshot: Snapshot | null) => (snapshot ? `Cancels ${count(snapshot.orders.filter(isOpenOrder).length, 'open order')}.` : 'Cancels open orders.');

function FlattenSheet({ snapshot, onClose }: { snapshot: Snapshot; onClose: () => void }) {
  const [passcode, setPasscode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const confirm = async () => {
    if (!passcode) return setError('Enter the passcode.');
    setBusy(true);
    const result = await sendCommand({ kind: 'flatten' }, passcode);
    setBusy(false);
    if (result.ok) onClose();
    else setError(result.error);
  };
  return (
    <ConfirmSheet title="Flatten all positions?" confirmLabel="Flatten" confirmClass="pw-btn-danger" busy={busy} onConfirm={confirm} onCancel={onClose}>
      <ul>
        <li>Pauses every strategy.</li>
        <li>{openOrdersLine(snapshot)}</li>
        <li>{`Closes ${count(snapshot.positions.length, 'position')} at market.`}</li>
      </ul>
      <PasscodeInput value={passcode} onChange={setPasscode} error={error} help="Flatten always asks for the passcode." />
    </ConfirmSheet>
  );
}

export function PauseAllSheet({ snapshot, onClose }: { snapshot: Snapshot | null; onClose: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const confirm = async () => {
    setBusy(true);
    const result = await sendCommand({ kind: 'pause-all' });
    setBusy(false);
    if (result.ok) onClose();
    else setError(result.error);
  };
  return (
    <ConfirmSheet title="Pause all strategies?" confirmLabel="Pause all" confirmClass="pw-btn-danger" busy={busy} error={error} onConfirm={confirm} onCancel={onClose}>
      <ul>
        <li>{snapshot ? `Stops new orders from ${count(snapshot.strategies.filter((s) => s.state.kind === 'running').length, 'running strategy', 'running strategies')}.` : 'Stops new orders from every strategy.'}</li>
        <li>{openOrdersLine(snapshot)}</li>
        <li>{snapshot ? `Keeps ${count(snapshot.positions.length, 'position')} open.` : 'Keeps positions open.'}</li>
      </ul>
    </ConfirmSheet>
  );
}

function PositionsTable({ positions, compact = false }: { positions: Position[]; compact?: boolean }) {
  const lastQty = useRef(new Map<string, number>());
  useEffect(() => {
    lastQty.current = new Map(positions.map((p) => [p.symbol, p.qty]));
  });
  const extra = compact ? 'pw-hide' : 'pw-hide-phone';
  return (
    <div className="pw-table-wrap">
      <table className="pw-table">
        <thead className="pw-caption">
          <tr>
            <th>Symbol</th>
            <th className="pw-r">Qty</th>
            <th className={`pw-r ${extra}`}>Avg</th>
            <th className="pw-r">Last</th>
            <th className="pw-r">P&amp;L</th>
            <th className={`pw-r ${extra}`}>P&amp;L %</th>
          </tr>
        </thead>
        <tbody className="pw-figure">
          {positions.map((p) => {
            const before = lastQty.current.get(p.symbol);
            const t = tone(p.unrealizedPl);
            return (
              <tr key={`${p.symbol}:${p.qty}`} className={before !== undefined && before !== p.qty ? 'pw-changed' : undefined}>
                <td className="pw-label pw-sym">{p.symbol}</td>
                <td className="pw-r">{qty(p.qty)}</td>
                <td className={`pw-r ${extra}`}>{money(p.avgEntryPrice)}</td>
                <td className="pw-r">{money(p.lastPrice)}</td>
                <td className="pw-r">
                  <SignedMoney value={p.unrealizedPl} />
                </td>
                <td className={`pw-r ${extra} ${toneClass[t]}`}>{`${signedPct(p.unrealizedPlPct)} ${glyph(t)}`.trim()}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function Positions({ snapshot, stale }: ScreenProps) {
  const { positions } = snapshot;
  return (
    <div className={`pw-stack-screen ${stale ? 'pw-is-stale' : ''}`}>
      <Panel title={`Open positions · ${positions.length}`} flush>
        {positions.length ? (
          <PositionsTable positions={positions} />
        ) : (
          <Empty title="No open positions.">Strategies open them on their next signal while the market is open.</Empty>
        )}
      </Panel>
    </div>
  );
}

export function Orders({ snapshot, stale }: ScreenProps) {
  const { orders } = snapshot;
  return (
    <div className={`pw-stack-screen ${stale ? 'pw-is-stale' : ''}`}>
      <Panel title={`Today · ${count(orders.length, 'order')}`} flush>
        {orders.length === 0 ? (
          <Empty title="No orders today.">Orders appear here as strategies trade, newest first.</Empty>
        ) : (
          <div className="pw-table-wrap">
            <table className="pw-table">
              <thead className="pw-caption">
                <tr>
                  <th>Time ET</th>
                  <th>Symbol</th>
                  <th>Side</th>
                  <th className="pw-r">Qty</th>
                  <th className="pw-r pw-hide-phone">Filled</th>
                  <th className="pw-r pw-hide-phone">Avg fill</th>
                  <th>Status</th>
                  <th className="pw-hide-phone">Strategy</th>
                </tr>
              </thead>
              <tbody className="pw-figure">
                {orders.map((o) => (
                  <tr key={o.id}>
                    <td className="pw-muted">{etClock(o.submittedAt)}</td>
                    <td className="pw-label pw-sym">{o.symbol}</td>
                    <td>
                      <span className="pw-tag pw-tag-quiet pw-figure-sm">{o.side}</span>
                    </td>
                    <td className="pw-r">{qty(o.qty)}</td>
                    <td className="pw-r pw-hide-phone">{qty(o.filledQty)}</td>
                    <td className="pw-r pw-hide-phone">{o.filledAvgPrice === null ? '' : money(o.filledAvgPrice)}</td>
                    <td className={o.status === 'rejected' ? 'pw-down' : undefined}>{o.status.replaceAll('_', ' ')}</td>
                    <td className={`pw-hide-phone ${o.strategyId ? '' : 'pw-muted'}`}>{o.strategyId ?? 'manual'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

function StrategyList({ strategies }: { strategies: Strategy[] }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [resuming, setResuming] = useState<Strategy | null>(null);
  const [error, setError] = useState<string | null>(null);
  const kinds = strategies.map((s) => s.state.kind).join();
  useEffect(() => setBusy(null), [kinds]);

  const pause = async (s: Strategy) => {
    setBusy(s.id);
    setError(null);
    const result = await sendCommand({ kind: 'pause-strategy', strategyId: s.id });
    if (!result.ok) {
      setBusy(null);
      setError(result.error);
    }
  };
  const closeResume = useCallback(() => setResuming(null), []);

  if (strategies.length === 0) return <Empty title="No strategies configured.">List them in PITWALL_STRATEGIES in .env.</Empty>;
  return (
    <>
      {strategies.map((s) => (
        <StrategyRow key={s.id} strategy={s} busy={busy === s.id} onToggle={() => (s.state.kind === 'running' ? pause(s) : setResuming(s))} />
      ))}
      {error && (
        <p className="pw-help pw-help-error pw-label pw-list-error" role="alert">
          {error}
        </p>
      )}
      {resuming && <ResumeSheet strategy={resuming} onClose={closeResume} onSent={() => setBusy(resuming.id)} />}
    </>
  );
}

export function Strategies({ snapshot }: ScreenProps) {
  const { strategies } = snapshot;
  return (
    <div className="pw-stack-screen">
      <Panel title={`Strategies · ${strategies.length}`} flush>
        <StrategyList strategies={strategies} />
      </Panel>
    </div>
  );
}

function ResumeSheet({ strategy, onClose, onSent }: { strategy: Strategy; onClose: () => void; onSent: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const confirm = async () => {
    setBusy(true);
    const result = await sendCommand({ kind: 'resume-strategy', strategyId: strategy.id });
    setBusy(false);
    if (!result.ok) return setError(result.error);
    onSent();
    onClose();
  };
  return (
    <ConfirmSheet title={`Resume ${strategy.id}?`} confirmLabel={`Resume ${strategy.id}`} confirmClass="pw-btn-primary" busy={busy} error={error} onConfirm={confirm} onCancel={onClose}>
      {strategy.state.kind === 'halted' && <p>Halted: {strategy.state.reason}</p>}
      <p>It trades {strategy.symbol} again on its next signal.</p>
    </ConfirmSheet>
  );
}

const dayLabel = new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long' });

export function Events({ snapshot }: ScreenProps) {
  const arrived = useArrivals(snapshot.events);
  const days = new Map<string, typeof snapshot.events>();
  for (const e of snapshot.events) {
    const day = dayLabel.format(new Date(e.at));
    days.set(day, [...(days.get(day) ?? []), e]);
  }
  if (days.size === 0) {
    return (
      <div className="pw-stack-screen">
        <Panel title="Events" flush>
          <Empty title="No events yet.">Halts, errors, fills and your own actions land here.</Empty>
        </Panel>
      </div>
    );
  }
  return (
    <div className="pw-stack-screen">
      {[...days].map(([day, events]) => (
        <Panel key={day} title={day} flush>
          {collapseEvents(events).map((g) => (
            <EventRow key={g.latest.id} group={g} fresh={arrived(g.latest)} />
          ))}
        </Panel>
      ))}
    </div>
  );
}
