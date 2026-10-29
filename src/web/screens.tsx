import { Pause } from 'lucide-react';
import { memo, useEffect, useRef, useState, type CSSProperties } from 'react';
import type { Position, Snapshot } from '../shared/domain.ts';
import { count, etClock, glyph, money, pct, qty, signedPct, tone } from '../shared/format.ts';
import { isOpenOrder } from '../shared/orders.ts';
import {
  collapseEvents,
  ConfirmSheet,
  Empty,
  EventLog,
  Figures,
  HoldToFlatten,
  LimitMeter,
  PasscodeInput,
  PitBoard,
  Readout,
  Screen,
  SignedMoney,
  signedFigure,
  SystemReadout,
  TimingTower,
  toneClass,
  useArrivals,
} from './components.tsx';
import { DEMO, sendCommand, usePost } from './data.ts';

export type ScreenProps = { snapshot: Snapshot; stale: boolean };

const ScreenLink = ({ href, children }: { href: string; children: string }) => (
  <a className="pw-screen-link pw-small" href={href}>
    {children}
  </a>
);

export const Overview = memo(function Overview({ snapshot, stale }: ScreenProps) {
  const { account, positions, limits, health, events, strategies, equityToday, heartbeatAt } = snapshot;
  const [pausing, setPausing] = useState(false);
  const [flattening, setFlattening] = useState(false);
  const unrealized = positions.reduce((sum, p) => sum + p.unrealizedPl, 0);
  const arrived = useArrivals(events);
  const latest = collapseEvents(events).slice(0, 6);

  return (
    <div className={`pw-ov ${stale ? 'pw-is-stale' : ''}`}>
      <div className="pw-ov-tower">
        <TimingTower
          strategies={strategies}
          limits={limits}
          footer={
            <>
              <div className="pw-controls">
                <button type="button" className="pw-btn pw-btn-stop" onClick={() => setPausing(true)}>
                  <Pause className="pw-icon" aria-hidden />
                  <span>Pause all</span>
                </button>
                <HoldToFlatten onComplete={() => setFlattening(true)} />
              </div>
              <p className="pw-small pw-muted pw-controls-hint">Pause all keeps positions. Flatten closes them at market after a 2‑second hold and your passcode.</p>
              <SystemReadout health={health} heartbeatAt={heartbeatAt} />
            </>
          }
        />
      </div>

      <div className="pw-ov-board">
        <PitBoard account={account} points={equityToday} stale={stale} />
      </div>

      <div className="pw-ov-screens">
        <Screen title={`Positions, ${positions.length} open`} flush className="pw-ov-positions" aside={<ScreenLink href="#/positions">All positions</ScreenLink>}>
          <PositionsTable positions={positions} />
        </Screen>
        <Screen title="Limits">
          {limits.map((l) => (
            <LimitMeter key={l.id} limit={l} />
          ))}
        </Screen>
        <Screen title="Account" className="pw-ov-account">
          <Figures
            rows={[
              { label: 'Buying power', value: money(account.buyingPower) },
              { label: 'Cash', value: money(account.cash) },
              { label: 'Unrealized P&L', value: <SignedMoney value={unrealized} /> },
            ]}
          />
        </Screen>
      </div>

      <div className="pw-ov-events">
        <Screen title="Events" flush aside={<ScreenLink href="#/events">Full log</ScreenLink>}>
          {latest.length ? <EventLog events={latest} fresh={arrived} /> : <Empty title="No events yet.">Halts, errors, fills and your own actions land here.</Empty>}
        </Screen>
      </div>

      {pausing && <PauseAllSheet snapshot={snapshot} onClose={() => setPausing(false)} />}
      {flattening && <FlattenSheet snapshot={snapshot} onClose={() => setFlattening(false)} />}
    </div>
  );
});

const openOrdersLine = (snapshot: Snapshot | null) => (snapshot ? `Cancels ${count(snapshot.orders.filter(isOpenOrder).length, 'open order')}.` : 'Cancels open orders.');

function FlattenSheet({ snapshot, onClose }: { snapshot: Snapshot; onClose: () => void }) {
  const [passcode, setPasscode] = useState('');
  const { error, attempt, busy, send } = usePost(() => sendCommand({ kind: 'flatten' }, passcode), onClose);
  return (
    <ConfirmSheet title="Flatten all positions?" confirmLabel="Flatten" confirmClass="pw-btn-danger" busy={busy} onConfirm={send} onCancel={onClose}>
      <ol className="pw-steps">
        <li>Pauses every strategy.</li>
        <li>{openOrdersLine(snapshot)}</li>
        <li>{`Closes ${count(snapshot.positions.length, 'position')} at market.`}</li>
      </ol>
      <PasscodeInput value={passcode} onChange={setPasscode} error={error} attempt={attempt} help={DEMO ? 'Demo: any passcode works.' : 'Flatten always asks for the passcode.'} />
    </ConfirmSheet>
  );
}

export function PauseAllSheet({ snapshot, onClose }: { snapshot: Snapshot | null; onClose: () => void }) {
  const { error, attempt, busy, send } = usePost(() => sendCommand({ kind: 'pause-all' }), onClose);
  return (
    <ConfirmSheet title="Pause all strategies?" confirmLabel="Pause all" confirmClass="pw-btn-danger" busy={busy} error={error} attempt={attempt} onConfirm={send} onCancel={onClose}>
      <ol className="pw-steps">
        <li>{snapshot ? `Stops new orders from ${count(snapshot.strategies.filter((s) => s.state.kind === 'running').length, 'running strategy', 'running strategies')}.` : 'Stops new orders from every strategy.'}</li>
        <li>{openOrdersLine(snapshot)}</li>
        <li>{snapshot ? `Keeps ${count(snapshot.positions.length, 'position')} open.` : 'Keeps positions open.'}</li>
      </ol>
    </ConfirmSheet>
  );
}

function PositionsTable({ positions }: { positions: Position[] }) {
  const lastQty = useRef(new Map<string, number>());
  useEffect(() => {
    lastQty.current = new Map(positions.map((p) => [p.symbol, p.qty]));
  });
  if (positions.length === 0) return <Empty title="No open positions.">Strategies open them on their next signal while the market is open.</Empty>;
  const widest = Math.max(...positions.map((p) => Math.abs(p.unrealizedPlPct))) || 1;
  return (
    <div className="pw-table-wrap">
      <table className="pw-table">
        <caption className="pw-sr">Open positions</caption>
        <thead className="pw-small">
          <tr>
            <th scope="col">Symbol</th>
            <th scope="col" className="pw-r">Qty</th>
            <th scope="col" className="pw-r pw-hide-phone">Avg</th>
            <th scope="col" className="pw-r">Last</th>
            <th scope="col" className="pw-r">P&amp;L</th>
            <th scope="col" className="pw-r pw-hide-phone">P&amp;L %</th>
          </tr>
        </thead>
        <tbody className="pw-figure">
          {positions.map((p) => {
            const before = lastQty.current.get(p.symbol);
            const t = tone(p.unrealizedPl);
            return (
              <tr key={`${p.symbol}:${p.qty}`} className={before !== undefined && before !== p.qty ? 'pw-changed' : undefined}>
                <td className="pw-timing" translate="no">
                  {p.symbol}
                </td>
                <td className="pw-r">{qty(p.qty)}</td>
                <td className="pw-r pw-hide-phone">{money(p.avgEntryPrice)}</td>
                <td className="pw-r">{money(p.lastPrice)}</td>
                <td className="pw-r">
                  <SignedMoney value={p.unrealizedPl} />
                </td>
                <td className={`pw-r pw-hide-phone ${toneClass[t]}`}>
                  <span className="pw-pl">
                    <span className="pw-pl-bar" style={{ '--pl': p.unrealizedPlPct / widest } as CSSProperties} aria-hidden />
                    {`${signedPct(p.unrealizedPlPct)} ${glyph(t)}`.trim()}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export const Positions = memo(function Positions({ snapshot, stale }: ScreenProps) {
  const { positions, account } = snapshot;
  const value = positions.reduce((sum, p) => sum + p.qty * p.lastPrice, 0);
  const gross = positions.reduce((sum, p) => sum + Math.abs(p.qty * p.lastPrice), 0);
  const unrealized = positions.reduce((sum, p) => sum + p.unrealizedPl, 0);
  return (
    <div className={`pw-page ${stale ? 'pw-is-stale' : ''}`}>
      <Readout
        cells={[
          { label: 'Open', value: String(positions.length) },
          { label: 'Market value', value: money(value) },
          { label: 'Unrealized P&L', value: signedFigure(unrealized), className: `pw-delta ${toneClass[tone(unrealized)]}` },
          { label: 'Exposure of equity', value: pct(account.equity > 0 ? (gross / account.equity) * 100 : 0) },
        ]}
      />
      <Screen title={`${count(positions.length, 'open position')}`} flush>
        <PositionsTable positions={positions} />
      </Screen>
    </div>
  );
});

const orderClass = (status: string) => (status === 'rejected' ? 'pw-sev-error' : isOpenOrder({ status }) ? 'pw-sev-warn' : 'pw-sev-info');

export const Orders = memo(function Orders({ snapshot, stale }: ScreenProps) {
  const { orders } = snapshot;
  const rejected = orders.filter((o) => o.status === 'rejected').length;
  return (
    <div className={`pw-page ${stale ? 'pw-is-stale' : ''}`}>
      <Readout
        cells={[
          { label: 'Orders today', value: String(orders.length) },
          { label: 'Filled', value: String(orders.filter((o) => o.status === 'filled').length) },
          { label: 'Open', value: String(orders.filter(isOpenOrder).length) },
          { label: 'Rejected', value: String(rejected), className: rejected ? 'pw-down' : '' },
        ]}
      />
      <Screen title={`Today, ${count(orders.length, 'order')}`} flush>
        {orders.length === 0 ? (
          <Empty title="No orders today.">Orders appear here as strategies trade, newest first.</Empty>
        ) : (
          <div className="pw-table-wrap">
            <table className="pw-table">
              <caption className="pw-sr">Orders today</caption>
              <thead className="pw-small">
                <tr>
                  <th scope="col">Time (ET)</th>
                  <th scope="col">Symbol</th>
                  <th scope="col">Side</th>
                  <th scope="col" className="pw-r">Qty</th>
                  <th scope="col" className="pw-r pw-hide-phone">Filled</th>
                  <th scope="col" className="pw-r pw-hide-phone">Avg fill</th>
                  <th scope="col">Status</th>
                  <th scope="col" className="pw-hide-phone">Strategy</th>
                </tr>
              </thead>
              <tbody className="pw-figure">
                {orders.map((o) => (
                  <tr key={o.id}>
                    <td className="pw-muted">{etClock(o.submittedAt)}</td>
                    <td className="pw-timing" translate="no">
                      {o.symbol}
                    </td>
                    <td className="pw-small pw-caps">{o.side}</td>
                    <td className="pw-r">{qty(o.qty)}</td>
                    <td className="pw-r pw-hide-phone">{qty(o.filledQty)}</td>
                    <td className="pw-r pw-hide-phone">{o.filledAvgPrice === null ? '' : money(o.filledAvgPrice)}</td>
                    <td>
                      <span className={`pw-status pw-small pw-caps ${orderClass(o.status)}`}>{o.status.replaceAll('_', ' ')}</span>
                    </td>
                    <td className={`pw-hide-phone ${o.strategyId ? '' : 'pw-muted'}`} translate={o.strategyId ? 'no' : undefined}>
                      {o.strategyId ?? 'manual'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Screen>
    </div>
  );
});

export const Strategies = memo(function Strategies({ snapshot, stale }: ScreenProps) {
  const { strategies } = snapshot;
  const inState = (kind: string) => strategies.filter((s) => s.state.kind === kind).length;
  const paused = inState('paused');
  const halted = inState('halted');
  const today = strategies.reduce((sum, s) => sum + s.todayPl, 0);
  return (
    <div className={`pw-page ${stale ? 'pw-is-stale' : ''}`}>
      <Readout
        cells={[
          { label: 'Running', value: String(inState('running')) },
          { label: 'Paused', value: String(paused), className: paused ? 'pw-warn' : '' },
          { label: 'Halted', value: String(halted), className: halted ? 'pw-down' : '' },
          { label: 'Today’s P&L', value: signedFigure(today), className: `pw-delta ${toneClass[tone(today)]}` },
        ]}
      />
      <TimingTower strategies={strategies} limits={snapshot.limits} />
    </div>
  );
});

const dayLabel = new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long' });

export const Events = memo(function Events({ snapshot }: ScreenProps) {
  const arrived = useArrivals(snapshot.events);
  const days = new Map<string, typeof snapshot.events>();
  for (const e of snapshot.events) {
    const day = dayLabel.format(new Date(e.at));
    const list = days.get(day);
    if (list) list.push(e);
    else days.set(day, [e]);
  }
  return (
    <div className="pw-page">
      {days.size === 0 ? (
        <Screen title="Events" flush>
          <Empty title="No events yet.">Halts, errors, fills and your own actions land here.</Empty>
        </Screen>
      ) : (
        [...days].map(([day, events]) => (
          <Screen key={day} title={day} flush>
            <EventLog events={collapseEvents(events)} fresh={arrived} />
          </Screen>
        ))
      )}
    </div>
  );
});
