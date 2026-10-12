import { Pause } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Snapshot, Strategy } from '../shared/domain.ts';
import { etClock, glyph, money, qty, signedMoney, signedPct, tone } from '../shared/format.ts';
import { ConfirmSheet, Delta, Empty, EventRow, HealthStrip, HoldToFlatten, LimitMeter, PasscodeInput, SignedMoney, Sparkline, StatTile, StrategyRow, toneClass } from './components.tsx';
import { sendCommand } from './data.ts';
import { isOpenOrder } from '../shared/orders.ts';

export type ScreenProps = { snapshot: Snapshot; stale: boolean; heartbeatAgeMs: number; openPauseAll: () => void };

export function Overview({ snapshot, stale, heartbeatAgeMs, openPauseAll }: ScreenProps) {
  const { account, positions, limits, health, events, strategies, equityToday } = snapshot;
  const [flattening, setFlattening] = useState(false);
  const change = account.equity - account.lastEquity;
  const changePct = account.lastEquity ? (change / account.lastEquity) * 100 : 0;
  const unrealized = positions.reduce((sum, p) => sum + p.unrealizedPl, 0);
  const halt = strategies.some((s) => s.state.kind === 'halted') ? events.find((e) => e.severity === 'halt') : undefined;

  return (
    <>
      <h1 className="pw-title pw-screen-title">Overview</h1>
      {halt && (
        <div className="pw-list">
          <EventRow event={halt} />
        </div>
      )}
      <div className={`pw-grid-4 ${stale ? 'pw-is-stale' : ''}`}>
        <StatTile label="Equity" value={money(account.equity)}>
          <Delta change={change} changePct={changePct} />
          <Sparkline points={equityToday} baseline={account.lastEquity} stale={stale} />
        </StatTile>
        <StatTile label="Today P&L" value={`${signedMoney(change)} ${glyph(tone(change))}`.trim()} valueClass={toneClass[tone(change)]}>
          <span className="pw-stat-sub pw-figure-sm">vs {money(account.lastEquity)} at last close</span>
        </StatTile>
        <StatTile label="Open positions" value={String(positions.length)}>
          <span className="pw-stat-sub pw-figure-sm">unrealized</span>
          <SignedMoney value={unrealized} className="pw-figure-sm" />
        </StatTile>
        <StatTile label="Buying power" value={money(account.buyingPower)}>
          <span className="pw-stat-sub pw-figure-sm">cash {money(account.cash)}</span>
        </StatTile>
      </div>

      <div className="pw-grid-2">
        <section className="pw-card pw-col" aria-labelledby="limits-label">
          <h2 id="limits-label" className="pw-caption pw-section-label">
            Limits
          </h2>
          {limits.map((l) => (
            <LimitMeter key={l.id} limit={l} />
          ))}
        </section>
        <section className="pw-card pw-col" aria-labelledby="controls-label">
          <h2 id="controls-label" className="pw-caption pw-section-label">
            Controls
          </h2>
          <button type="button" className="pw-btn pw-btn-stop pw-btn-block" onClick={openPauseAll}>
            <Pause className="pw-icon" aria-hidden />
            <span>Pause all</span>
          </button>
          <HoldToFlatten onComplete={() => setFlattening(true)} />
          <p className="pw-btn-hint pw-label">Hold 2 s, then enter the passcode. Pauses everything and closes every position at market.</p>
        </section>
      </div>

      <HealthStrip health={health} heartbeatAgeMs={heartbeatAgeMs} />

      <section className="pw-col" aria-labelledby="events-label">
        <div className="pw-list-head">
          <h2 id="events-label" className="pw-caption pw-section-label">
            Latest events
          </h2>
          <a href="#/events" className="pw-label">
            All events
          </a>
        </div>
        {events.length ? (
          <div className="pw-list">
            {events.slice(0, 5).map((e) => (
              <EventRow key={e.id} event={e} />
            ))}
          </div>
        ) : (
          <Empty>No events today.</Empty>
        )}
      </section>

      {flattening && <FlattenSheet snapshot={snapshot} onClose={() => setFlattening(false)} />}
    </>
  );
}

const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

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
        <li>{snapshot ? `Closes ${count(snapshot.positions.length, 'position')} at market.` : 'Closes every position at market.'}</li>
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

export function Positions({ snapshot, stale }: ScreenProps) {
  const lastQty = useRef(new Map<string, number>());
  useEffect(() => {
    lastQty.current = new Map(snapshot.positions.map((p) => [p.symbol, p.qty]));
  });
  return (
    <>
      <h1 className="pw-title pw-screen-title">Positions</h1>
      {snapshot.positions.length === 0 ? (
        <Empty>No open positions.</Empty>
      ) : (
        <div className={`pw-table-wrap ${stale ? 'pw-is-stale' : ''}`}>
          <table className="pw-table">
            <thead className="pw-caption">
              <tr>
                <th>Symbol</th>
                <th className="pw-r">Qty</th>
                <th className="pw-r">Avg</th>
                <th className="pw-r">Last</th>
                <th className="pw-r">P&L</th>
                <th className="pw-r">P&L %</th>
              </tr>
            </thead>
            <tbody className="pw-figure">
              {snapshot.positions.map((p) => {
                const before = lastQty.current.get(p.symbol);
                const t = tone(p.unrealizedPl);
                return (
                  <tr key={`${p.symbol}:${p.qty}`} className={before !== undefined && before !== p.qty ? 'pw-changed' : undefined}>
                    <td className="pw-label">{p.symbol}</td>
                    <td className="pw-r">{qty(p.qty)}</td>
                    <td className="pw-r">{money(p.avgEntryPrice)}</td>
                    <td className="pw-r">{money(p.lastPrice)}</td>
                    <td className={`pw-r ${toneClass[t]}`}>{`${signedMoney(p.unrealizedPl)} ${glyph(t)}`.trim()}</td>
                    <td className={`pw-r ${toneClass[t]}`}>{`${signedPct(p.unrealizedPlPct)} ${glyph(t)}`.trim()}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

export function Orders({ snapshot, stale }: ScreenProps) {
  return (
    <>
      <h1 className="pw-title pw-screen-title">Orders &amp; fills</h1>
      {snapshot.orders.length === 0 ? (
        <Empty>No orders today.</Empty>
      ) : (
        <div className={`pw-table-wrap ${stale ? 'pw-is-stale' : ''}`}>
          <table className="pw-table">
            <thead className="pw-caption">
              <tr>
                <th>Time ET</th>
                <th>Symbol</th>
                <th>Side</th>
                <th className="pw-r">Qty</th>
                <th className="pw-r">Filled</th>
                <th className="pw-r">Avg fill</th>
                <th>Status</th>
                <th>Strategy</th>
              </tr>
            </thead>
            <tbody className="pw-figure">
              {snapshot.orders.map((o) => (
                <tr key={o.id}>
                  <td>{etClock(o.submittedAt)}</td>
                  <td className="pw-label">{o.symbol}</td>
                  <td className="pw-label">{o.side === 'buy' ? 'Buy' : 'Sell'}</td>
                  <td className="pw-r">{qty(o.qty)}</td>
                  <td className="pw-r">{qty(o.filledQty)}</td>
                  <td className="pw-r">{o.filledAvgPrice === null ? '' : money(o.filledAvgPrice)}</td>
                  <td className={o.status === 'rejected' ? 'pw-down' : undefined}>{o.status.replaceAll('_', ' ')}</td>
                  <td className={o.strategyId ? undefined : 'pw-muted'}>{o.strategyId ?? 'manual'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

export function Strategies({ snapshot }: ScreenProps) {
  const [busy, setBusy] = useState<string | null>(null);
  const [resuming, setResuming] = useState<Strategy | null>(null);
  const [error, setError] = useState<string | null>(null);
  const kinds = snapshot.strategies.map((s) => s.state.kind).join();
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

  return (
    <>
      <h1 className="pw-title pw-screen-title">Strategies</h1>
      {snapshot.strategies.length === 0 ? (
        <Empty>No strategies configured.</Empty>
      ) : (
        <div className="pw-list">
          {snapshot.strategies.map((s) => (
            <StrategyRow key={s.id} strategy={s} busy={busy === s.id} onToggle={() => (s.state.kind === 'running' ? pause(s) : setResuming(s))} />
          ))}
        </div>
      )}
      {error && <p className="pw-help pw-help-error pw-label" role="alert">{error}</p>}
      {resuming && <ResumeSheet strategy={resuming} onClose={closeResume} onSent={() => setBusy(resuming.id)} />}
    </>
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
    <ConfirmSheet title={`Resume ${strategy.id}?`} confirmLabel={`Resume ${strategy.id}`} confirmClass="" busy={busy} error={error} onConfirm={confirm} onCancel={onClose}>
      {strategy.state.kind === 'halted' && <p>Halted: {strategy.state.reason}</p>}
      <p>It trades {strategy.symbol} again on its next signal.</p>
    </ConfirmSheet>
  );
}

const dayLabel = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

export function Events({ snapshot }: ScreenProps) {
  const groups = new Map<string, typeof snapshot.events>();
  for (const e of snapshot.events) {
    const day = dayLabel.format(new Date(e.at));
    groups.set(day, [...(groups.get(day) ?? []), e]);
  }
  return (
    <>
      <h1 className="pw-title pw-screen-title">Events</h1>
      {groups.size === 0 && <Empty>No events today.</Empty>}
      {[...groups].map(([day, events]) => (
        <section key={day} className="pw-col" aria-label={day}>
          <h2 className="pw-caption pw-section-label">{day}</h2>
          <div className="pw-list">
            {events.map((e) => (
              <EventRow key={e.id} event={e} />
            ))}
          </div>
        </section>
      ))}
    </>
  );
}
