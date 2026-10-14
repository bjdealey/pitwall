import { Activity, ArrowLeftRight, Briefcase, Gauge, Layers, OctagonX, Pause } from 'lucide-react';
import type { CSSProperties, ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { evaluateLimits } from '../engine/limits.ts';
import { demoSnapshot } from '../shared/demo.ts';
import type { MarketSession, Strategy, StrategyId } from '../shared/domain.ts';
import {
  collapseEvents,
  Empty,
  EventLog,
  Figures,
  HeartbeatAgeContext,
  HoldToFlatten,
  LimitMeter,
  MarketChip,
  ModeStrip,
  PasscodeInput,
  PitBoard,
  Screen,
  SignedMoney,
  SystemReadout,
  TimingTower,
  TrackBand,
  trackStatus,
} from './components.tsx';
import { Orders, Overview, Positions } from './screens.tsx';

const at = (time: string, day = '2026-10-13') => `${day}T${time}Z`;
const NOW = at('17:30:00');
const noop = () => {};

const snapshot = demoSnapshot(new Date(NOW));
const { account, equityToday, health } = snapshot;
const [spy, qqq] = snapshot.strategies as [Strategy, Strategy];
const events = snapshot.events;
const qqqPaused: Strategy = { ...qqq, state: { kind: 'paused', by: 'you', at: at('15:02:11') } };
const iwmHalted: Strategy = {
  id: 'sma-cross-iwm' as StrategyId,
  symbol: 'IWM',
  state: { kind: 'halted', reason: 'Rejection limit reached (3 of 3 orders in a row).', at: at('14:12:40') },
  todayPl: 0,
  positions: 0,
  fillsToday: 0,
};

const market: Record<MarketSession['state'], MarketSession> = {
  open: snapshot.market,
  pre: { state: 'pre', nextChangeAt: at('13:30:00') },
  after: { state: 'after', nextChangeAt: at('00:00:00', '2026-10-14') },
  closed: { state: 'closed', nextChangeAt: at('08:00:00', '2026-10-14') },
};

const strainedLimits = evaluateLimits(
  { account: { ...account, equity: 98_440 }, consecutiveRejections: 1, lastBrokerOkAt: new Date(Date.parse(NOW) - 31_000), now: new Date(NOW) },
  { dailyLossPct: 2, maxRejections: 3, brokerSilenceS: 30 },
);

const band = (strategies: Strategy[], extra: { market?: MarketSession; stale?: boolean; heartbeatAgeMs?: number } = {}) =>
  trackStatus({ strategies, market: market.open, stale: false, heartbeatAgeMs: 2_000, ...extra });

const ROUTES = [
  { label: 'Overview', short: 'Overview', Icon: Gauge },
  { label: 'Positions', short: 'Positions', Icon: Briefcase },
  { label: 'Orders & fills', short: 'Orders', Icon: ArrowLeftRight },
  { label: 'Strategies', short: 'Strategies', Icon: Layers },
  { label: 'Events', short: 'Events', Icon: Activity },
];

const pad: CSSProperties = { padding: 16 };
const stack: CSSProperties = { display: 'grid', gap: 8, padding: 16 };
const row: CSSProperties = { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, padding: 16 };

const towerFooter = (
  <>
    <div className="pw-controls">
      <button type="button" className="pw-btn pw-btn-stop">
        <Pause className="pw-icon" aria-hidden />
        <span>Pause all</span>
      </button>
      <HoldToFlatten onComplete={noop} />
    </div>
    <p className="pw-small pw-muted pw-controls-hint">Pause all keeps positions. Flatten closes them at market after a 2-second hold and your passcode.</p>
    <SystemReadout health={health} heartbeatAt={snapshot.heartbeatAt} />
  </>
);

export type Card = { name: string; group: string; height: number; width?: number; subtitle: string; readme: string; body: ReactElement };

export const cards: Card[] = [
  {
    name: 'ModeStrip',
    group: 'Status',
    height: 120,
    width: 720,
    subtitle: 'paper, live, before sign-in',
    body: (
      <div style={stack}>
        <ModeStrip mode="paper" />
        <ModeStrip mode="live" />
        <ModeStrip mode={null} />
      </div>
    ),
    readme: `The strip above everything that says whether real money is at stake.

**Provide:** the engine's mode, \`paper\` or \`live\`, or nothing before the first snapshot and on sign-in.

**Use:**
- It is the first row of every screen, the sign-in screen included, \`banner-h\` tall.
- PAPER is a quiet strip in \`paper\` and \`on-paper\`. LIVE inverts to \`live\` and \`on-live\` in bold, so it can never pass for a flag.
- Before sign-in it reads "Pitwall" in \`muted\`, because the mode is not known yet.

**Don't:**
- Don't offer a mode switch anywhere. Live trading is a config flag on the Pi.
- Don't colour it with a flag colour. Flags belong to the TrackBand.

Source: \`ModeStrip\` in \`src/web/components.tsx\`.`,
  },
  {
    name: 'TrackBand',
    group: 'Status',
    height: 288,
    width: 1100,
    subtitle: 'calm, chequered, paused, stale, halted',
    body: (
      <div style={stack}>
        <TrackBand status={band([spy, qqq])} />
        <TrackBand status={band([spy, qqq], { market: market.after })} />
        <TrackBand status={band([spy, qqqPaused])} />
        <TrackBand status={band([spy, qqq], { stale: true, heartbeatAgeMs: 47_000 })} />
        <TrackBand status={band([spy, iwmHalted])} />
      </div>
    ),
    readme: `The session's flag: one band under the ModeStrip that says how the session is going.

**Provide:** a status from \`trackStatus()\`, which takes the strategies, the market session and the feed's freshness.

**Use:**
- Calm when all runs: \`surface\` with a small \`flag-green\` flag icon and "All 2 strategies running."
- Chequered flag on \`surface-2\` before the open, after hours and when closed.
- \`flag-yellow\` with \`on-flag\` text when a strategy is paused, or when no snapshot arrived for 3s or the heartbeat is older than 15s. Stale reads "No engine data." with the last heartbeat's age in the detail.
- \`flag-red\` with \`on-flag-red\` text when the engine halted, with the halt reason verbatim.
- Paused and halted bands link to Strategies with "Review strategies".
- Only the headline is a live region, and it never holds a counter, so a screen reader hears each change once.

**Don't:**
- Don't write "Red flag" or "Yellow flag". The band shows the flag; the words say what happened.
- Don't make the calm band loud. Trouble is loud; calm is not.

Source: \`TrackBand\` and \`trackStatus\` in \`src/web/components.tsx\`.`,
  },
  {
    name: 'MarketChip',
    group: 'Status',
    height: 64,
    width: 900,
    subtitle: 'open, pre-market, after-hours, closed',
    body: (
      <div style={row}>
        <MarketChip market={market.open} now={Date.parse(NOW)} />
        <MarketChip market={market.pre} now={Date.parse(at('12:00:00'))} />
        <MarketChip market={market.after} now={Date.parse(at('21:00:00'))} />
        <MarketChip market={market.closed} now={Date.parse(NOW)} />
      </div>
    ),
    readme: `The US market session and when it next changes, in ET.

**Provide:** the market session from the snapshot, and the current time so the chip can add a weekday when the change is not today.

**Use:**
- It sits in the gantry beside Stop, \`chip-h\` tall, with a status light: \`pos\` when open, an outlined ring for pre-market and after-hours, \`muted\` when closed.
- Times are always ET and labelled: "closes 16:00 ET".
- Below 900px it shows the state only.

**Don't:**
- Don't convert market times to local time. The exchange keeps ET.

Source: \`MarketChip\` in \`src/web/components.tsx\`.`,
  },
  {
    name: 'Gantry',
    group: 'Navigation',
    height: 124,
    width: 1200,
    subtitle: 'mode strip, track band and header on desktop',
    body: (
      <div>
        <ModeStrip mode="paper" />
        <TrackBand status={band([spy, qqq])} />
        <header className="pw-gantry">
          <span className="pw-wordmark" translate="no">
            PITWALL
          </span>
          <nav className="pw-nav" aria-label="Screens">
            {ROUTES.map(({ label }, i) => (
              <a key={label} href="#" className="pw-nav-item pw-timing" aria-current={i === 0 ? 'page' : undefined}>
                {label}
                {i === 0 && <span className="pw-nav-pill" aria-hidden />}
              </a>
            ))}
          </nav>
          <MarketChip market={market.open} now={Date.parse(NOW)} />
          <button type="button" className="pw-btn pw-btn-stop pw-btn-compact">
            <OctagonX className="pw-icon" aria-hidden />
            <span>Stop</span>
          </button>
        </header>
      </div>
    ),
    readme: `The top of every screen: the ModeStrip, the TrackBand, then the gantry header with the wordmark, the five screens, the MarketChip and Stop.

**Provide:** the current route, the market session and a Stop handler that opens the Pause all sheet.

**Use:**
- The header is \`header-h\` tall on \`surface\`. The PITWALL wordmark is the \`wordmark\` style, expanded against the condensed tabs.
- Tabs use the \`timing\` style in \`muted\`. The current one is \`fg\` with a 3px \`accent\` bar that slides to the new tab.
- Stop is on every screen and never moves.
- The first Tab reaches a hidden "Skip to content" button that moves focus to the page.
- Side padding is the gutter (24px, 16px below 900px), never less than the safe-area inset.
- Below 900px the tabs move to the TabBar.

**Don't:**
- Don't add a sixth screen to the bar. Five fit a phone tab bar.

Source: \`Shell\` in \`src/web/main.tsx\`.`,
  },
  {
    name: 'TabBar',
    group: 'Navigation',
    height: 60,
    width: 390,
    subtitle: 'phone navigation, below 900px',
    body: (
      <nav className="pw-tabbar" aria-label="Screens">
        {ROUTES.map(({ short, Icon }, i) => (
          <a key={short} href="#" className="pw-tab pw-small" aria-current={i === 0 ? 'page' : undefined}>
            {i === 0 && <span className="pw-tab-pill" aria-hidden />}
            <Icon className="pw-icon" aria-hidden />
            {short}
          </a>
        ))}
      </nav>
    ),
    readme: `The five screens as a bottom bar on phones.

**Provide:** the current route.

**Use:**
- Shown below 900px only, \`tabbar-h\` tall on \`surface\`, padded for the home indicator and side insets.
- Each tab is a Lucide icon at 18px over a short label in the \`small\` style. The current tab is \`fg\` with a 3px \`accent\` bar on top; the rest are \`muted\`.
- Tabs are links, so the URL hash carries the screen.

**Don't:**
- Don't drop the labels. Icons alone do not say Orders from Events.

Source: \`Shell\` in \`src/web/main.tsx\`.`,
  },
  {
    name: 'PitBoard',
    group: 'Data',
    height: 280,
    width: 900,
    subtitle: 'equity, today, close and high, beside the trace',
    body: (
      <div style={pad}>
        <PitBoard account={account} points={equityToday} stale={false} />
      </div>
    ),
    readme: `Equity on a pit board: stacked slats with asphalt between them, beside the day's trace.

**Provide:** the account (equity and previous close), today's equity samples, and whether the feed is stale.

**Use:**
- Slat one is equity in \`hero\`. Slat two is today's change in \`board\` with its percent and ▲ or ▼. Slat three pairs the previous close with the day high.
- The day high and its dot on the trace are \`best\` (sector purple) only when above the previous close.
- The trace fills to the previous close, a dashed \`control\` line, in \`pos\` or \`neg\` by today's direction. Times along the axis are ET.
- A change under 0.01% reads "<0.01%", never a signed zero.
- Stale figures and the trace fade to \`muted\`.

**Don't:**
- Don't flash prices on ticks.
- Don't use purple for anything but the best of the session.

Source: \`PitBoard\` in \`src/web/components.tsx\`.`,
  },
  {
    name: 'TimingTower',
    group: 'Data',
    height: 630,
    width: 392,
    subtitle: 'ranked strategies, controls and system readout',
    body: (
      <div style={pad}>
        <TimingTower strategies={[spy, qqqPaused, iwmHalted]} footer={towerFooter} />
      </div>
    ),
    readme: `Strategies ranked like an F1 timing tower, by today's P&L, with their switches, and the emergency controls at its foot.

**Provide:** the strategies, and on Overview a footer with Pause all, HoldToFlatten, the hint and the SystemReadout.

**Use:**
- Rows show the position (P1, P2), the strategy ID in \`timing\`, today's gain or loss and a switch. The leader's gain is \`best\` when it is up and there is more than one strategy.
- The meta line shows a status value in capitals (RUNNING in \`pos\`, PAUSED in \`warn\`, HALTED as a \`flag-red\` chip), the symbol and fills today. A halted row adds the reason verbatim.
- The switch is on only while running. Turning it off pauses that strategy at once; turning it on asks first in a ConfirmSheet that names the strategy. The knob pulses while the engine applies the command.
- A row flashes its state colour once when its state changes.
- The tower is \`tower-w\` wide on desktop and full width below 1100px.

**Don't:**
- Don't offer "Resume all". Resume is per strategy and never automatic.
- Don't edit strategy parameters here. Strategies live in code.

Source: \`TimingTower\` in \`src/web/components.tsx\`.`,
  },
  {
    name: 'SystemReadout',
    group: 'Data',
    height: 218,
    width: 392,
    subtitle: 'engine, broker, CPU, disk, memory, uptime',
    body: (
      <div style={pad}>
        <div className="pw-tower" style={pad}>
          <SystemReadout health={health} heartbeatAt={snapshot.heartbeatAt} />
        </div>
      </div>
    ),
    readme: `The Pi and the engine at a glance, at the foot of the timing tower.

**Provide:** the health sample, the last heartbeat time and its age.

**Use:**
- Engine shows the heartbeat age with a status light that sends out one ring per heartbeat, every 5s, and stops when data goes stale.
- Broker shows "connected" with a \`pos\` light or "down" with a \`neg\` light.
- CPU shows the temperature and "throttled" when the Pi throttles; a \`warn\` light from 75°C. Disk warns from 80% and turns \`neg\` from 95%.
- Memory and uptime are plain figures. CPU and disk drop out when the host cannot report them.

**Don't:**
- Don't put a light on a cell that has nothing to warn about.

Source: \`SystemReadout\` in \`src/web/components.tsx\`.`,
  },
  {
    name: 'LimitMeter',
    group: 'Data',
    height: 306,
    width: 420,
    subtitle: 'calm, near the limit, breached',
    body: (
      <div style={pad}>
        <Screen title="Limits">
          {strainedLimits.map((l) => (
            <LimitMeter key={l.id} limit={l} />
          ))}
        </Screen>
      </div>
    ),
    readme: `How close one automatic halt is to firing.

**Provide:** a limit from the engine: its label, used and max, the detail line and whether it is breached.

**Use:**
- Three meters on Overview: daily loss, rejections in a row and broker silence.
- The fill is \`control\` while calm, \`warn\` from 75%, \`neg\` when breached, and the percent takes the same colour.
- The detail line is the engine's own words: "$1,560.00 of $2,000.00".
- The track is an ARIA meter with the detail as its value text.

**Don't:**
- Don't round a breach down. At or past the max is breached.

Source: \`LimitMeter\` in \`src/web/components.tsx\`; limits from \`evaluateLimits\` in \`src/engine/limits.ts\`.`,
  },
  {
    name: 'Figures',
    group: 'Data',
    height: 206,
    width: 392,
    subtitle: 'labelled figures in a list',
    body: (
      <div style={pad}>
        <Screen title="Account">
          <Figures
            rows={[
              { label: 'Buying power', value: '$197,412.36' },
              { label: 'Cash', value: '$92,317.52' },
              { label: 'Unrealized P&L', value: <SignedMoney value={37.12} /> },
            ]}
          />
        </Screen>
      </div>
    ),
    readme: `Labelled figures as a description list: label left in \`muted\`, figure right.

**Provide:** rows of a label and a value. A value can be text or a SignedMoney.

**Use:**
- Labels use \`label\`; figures use \`figure\`, condensed with tabular figures so columns line up.
- Rows divide with a \`border\` rule; the first and last lose their outer padding.

**Don't:**
- Don't join related facts with middle dots. Give each its own row.

Source: \`Figures\` in \`src/web/components.tsx\`.`,
  },
  {
    name: 'DataTable',
    group: 'Data',
    height: 580,
    width: 1000,
    subtitle: 'positions and orders',
    body: (
      <div className="pw-main">
        <Positions snapshot={snapshot} stale={false} />
        <div style={{ height: 16 }} />
        <Orders snapshot={snapshot} stale={false} />
      </div>
    ),
    readme: `Positions and orders as plain tables inside a Screen.

**Provide:** the rows. Positions carry symbol, quantity, average, last, P&L and P&L %; orders carry time, symbol, side, quantity, filled, average fill, status and strategy.

**Use:**
- Headers in \`small\` and \`muted\`; cells in \`figure\`; symbols in \`timing\`. Numbers align right.
- Rows are \`row-h\` tall and alternate \`surface\` and \`surface-2\`.
- Sides and statuses are status values in capitals. Rejected is \`neg\`, open is \`warn\`, done is \`muted\`.
- Order times are ET. An order with no strategy reads "manual".
- A position row tints once when its quantity changes.
- Below 900px the secondary columns hide and the table scrolls sideways if it must.

**Don't:**
- Don't colour a whole row by gain or loss. Only the P&L cells carry direction.

Source: \`Positions\` and \`Orders\` in \`src/web/screens.tsx\`.`,
  },
  {
    name: 'SignedMoney',
    group: 'Data',
    height: 206,
    width: 392,
    subtitle: 'gain, loss, no change',
    body: (
      <div style={pad}>
        <Screen title="Today">
          <Figures
            rows={[
              { label: 'Gain', value: <SignedMoney value={412.08} /> },
              { label: 'Loss', value: <SignedMoney value={-96.1} /> },
              { label: 'No change', value: <SignedMoney value={0.004} /> },
            ]}
          />
        </Screen>
      </div>
    ),
    readme: `A money change with its sign, colour and glyph.

**Provide:** the change in dollars, and optionally the type style class.

**Use:**
- Gains are \`pos\` with + and ▲; losses are \`neg\` with a true minus (U+2212) and ▼. On the timing screen the gain green is 2.6× lighter than the loss red, so the pair holds without hue.
- Anything that rounds to zero cents reads "$0.00" in \`muted\`, no sign, no glyph.
- It never wraps.

**Don't:**
- Don't use a hyphen or parentheses for negatives.
- Don't drop the glyph. Direction must not rest on colour alone.

Source: \`SignedMoney\` in \`src/web/components.tsx\`; formats in \`src/shared/format.ts\`.`,
  },
  {
    name: 'EventRow',
    group: 'Data',
    height: 548,
    width: 900,
    subtitle: 'the log, with repeats folded',
    body: (
      <div style={pad}>
        <Screen
          title="Events"
          flush
          aside={
            <a className="pw-screen-link pw-small" href="#">
              Full log
            </a>
          }
        >
          <EventLog events={collapseEvents(events)} fresh={() => false} />
        </Screen>
      </div>
    ),
    readme: `One line of the event log: time, severity, message and source.

**Provide:** events newest first. \`collapseEvents\` folds runs of the same message into one row.

**Use:**
- Time is local 24-hour in \`small\` \`muted\`. Severity is a status value: INFO \`muted\`, WARN \`warn\`, ERROR and HALT \`neg\`.
- The message uses \`body\` and wraps; the source sits under it in \`muted\`. A folded row says how often: "broker, 3 times since 16:47:05".
- The full log groups rows under a Screen per day.
- A new row drops in and its tint fades over 1.6s.
- Below 900px the time and severity sit above the message.

**Don't:**
- Don't rewrite engine messages. Halt reasons appear verbatim.

Source: \`EventRow\` and \`EventLog\` in \`src/web/components.tsx\`.`,
  },
  {
    name: 'Screen',
    group: 'Layout',
    height: 192,
    width: 900,
    subtitle: 'a titled monitor, with an empty state',
    body: (
      <div style={{ ...pad, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start' }}>
        <Screen
          title="Positions, 0 open"
          flush
          aside={
            <a className="pw-screen-link pw-small" href="#">
              All positions
            </a>
          }
        >
          <Empty title="No open positions.">Strategies open them on their next signal while the market is open.</Empty>
        </Screen>
        <Screen title="Account">
          <Figures
            rows={[
              { label: 'Buying power', value: '$197,412.36' },
              { label: 'Cash', value: '$92,317.52' },
            ]}
          />
        </Screen>
      </div>
    ),
    readme: `A black monitor on the gantry: a titled section that holds one kind of data.

**Provide:** a sentence-case title, optional aside (usually a link to the full screen), and the content. \`flush\` drops the body padding for tables and logs.

**Use:**
- \`surface\` on the \`bg\` asphalt with \`radius-sm\` corners. No shadow; depth is asphalt showing between screens.
- The head is at least \`tap-min\` tall with the title in \`label\` bold and a \`border\` rule under it.
- Screens are named for what they show: "Positions, 2 open", "Limits", "Account".
- An empty Screen says what will fill it.

**Don't:**
- Don't put an eyebrow label above the title.
- Don't nest a Screen in a Screen.

Source: \`Screen\` and \`Empty\` in \`src/web/components.tsx\`.`,
  },
  {
    name: 'Button',
    group: 'Controls',
    height: 80,
    width: 820,
    subtitle: 'default, primary, stop, danger, busy',
    body: (
      <div style={row}>
        <button type="button" className="pw-btn">
          Cancel
        </button>
        <button type="button" className="pw-btn pw-btn-primary">
          Sign in
        </button>
        <button type="button" className="pw-btn pw-btn-stop pw-btn-compact">
          <OctagonX className="pw-icon" aria-hidden />
          <span>Stop</span>
        </button>
        <button type="button" className="pw-btn pw-btn-stop">
          <Pause className="pw-icon" aria-hidden />
          <span>Pause all</span>
        </button>
        <button type="button" className="pw-btn pw-btn-danger">
          Flatten
        </button>
        <button type="button" className="pw-btn pw-btn-primary" disabled>
          Checking…
        </button>
      </div>
    ),
    readme: `Buttons are verbs that name their effect.

**Provide:** the label, and an icon only beside a word.

**Use:**
- At least \`tap-min\` tall, \`radius-md\`, label at 14px bold in the semi-condensed width.
- Default: \`control\` edge, transparent fill. Primary (Sign in, Resume): \`fg\` fill. Stop and Pause all: \`neg\` edge and text. Danger, the confirm in Pause all and Flatten sheets: \`flag-red\` fill.
- Buttons press to 98%. A busy button reads what it is doing: "Checking…", "Sending…".
- Hover makes a button more prominent, never less.

**Don't:**
- Don't write "OK" or "Are you sure?". Confirm titles ask with the same verb: "Pause all strategies?"
- Don't make an icon-only button.

Source: \`.pw-btn\` in \`src/web/pitwall.css\`.`,
  },
  {
    name: 'HoldToFlatten',
    group: 'Controls',
    height: 80,
    width: 392,
    subtitle: 'at rest and mid-hold',
    body: (
      <div className="pw-controls" style={pad}>
        <HoldToFlatten onComplete={noop} />
        <button type="button" className="pw-btn pw-btn-flatten pw-holding" style={{ '--hold': 0.55 } as CSSProperties}>
          <span className="pw-hold" aria-hidden />
          <span>Keep holding…</span>
        </button>
      </div>
    ),
    readme: `The deliberate way to close every position: a 2-second hold, then the passcode.

**Provide:** what happens when the hold completes, which is opening the Flatten sheet.

**Use:**
- \`flag-red\` fill. Pressing starts a fill that tracks the 2s hold; the label reads "Keep holding…" and the button settles to 98.5%. Letting go early eases the fill back.
- Space or Enter held for 2s works the same; key repeats never shortcut the hold, and the still-held key does nothing inside the sheet that opens. A screen reader's click, which has no press behind it, opens the passcode sheet directly; the passcode still guards it.
- It sits beside Pause all at the foot of the timing tower.

**Don't:**
- Don't let a quick click flatten.
- Don't put Flatten in the gantry. Stop is the fast control; Flatten is deliberate.

Source: \`HoldToFlatten\` in \`src/web/components.tsx\`.`,
  },
  {
    name: 'ConfirmSheet',
    group: 'Controls',
    height: 400,
    width: 560,
    subtitle: 'the Flatten sheet, asking for the passcode',
    body: (
      <div style={{ background: 'var(--bg)' }}>
        <div style={{ display: 'grid', placeItems: 'center', padding: 24, background: 'var(--scrim)' }}>
          <dialog open className="pw-sheet" aria-labelledby="sheet-title" style={{ position: 'static', margin: 0 }}>
            <form className="pw-sheet-form">
              <h2 id="sheet-title" className="pw-title">
                Flatten all positions?
              </h2>
              <div className="pw-body pw-sheet-body">
                <ul>
                  <li>Pauses every strategy.</li>
                  <li>Cancels 1 open order.</li>
                  <li>Closes 2 positions at market.</li>
                </ul>
                <PasscodeInput value="" onChange={noop} error={null} help="Flatten always asks for the passcode." />
              </div>
              <div className="pw-sheet-actions">
                <button type="button" className="pw-btn">
                  Cancel
                </button>
                <button type="submit" className="pw-btn pw-btn-danger">
                  Flatten
                </button>
              </div>
            </form>
          </dialog>
        </div>
      </div>
    ),
    readme: `A native modal dialog that asks before an action, and lists exactly what it will do.

**Provide:** a title that asks with the action's verb, the confirm label and class, the consequence list, and the confirm and cancel handlers.

**Use:**
- \`surface\` with \`radius-md\` and \`shadow-sheet\` over \`scrim\`; it fades and rises in 200ms.
- The body is a list of effects with live counts: "Cancels 1 open order."
- Focus starts on Cancel, Tab stays inside, Escape or a click on the backdrop cancels, and focus returns to the control that opened it.
- Pause all and Flatten confirm with \`pw-btn-danger\`; Resume confirms with \`pw-btn-primary\`. Flatten adds a PasscodeInput.
- It scrolls inside itself on short screens.

**Don't:**
- Don't ask "Are you sure?". Say the action and its effects.
- Don't confirm a pause of one strategy. Pausing is safe and immediate.

Source: \`ConfirmSheet\` in \`src/web/components.tsx\`.`,
  },
  {
    name: 'PasscodeInput',
    group: 'Controls',
    height: 284,
    width: 420,
    subtitle: 'with help, and after a wrong passcode',
    body: (
      <div style={{ ...stack, gap: 24 }}>
        <PasscodeInput value="" onChange={noop} error={null} help="Sign in to watch and stop the bot." />
        <PasscodeInput value="123" onChange={noop} error="Wrong passcode. 4 tries left." help="" />
      </div>
    ),
    readme: `The passcode field for sign-in and Flatten.

**Provide:** the value, its change handler, the help line and any error.

**Use:**
- The figure sits in \`board\` with wide tracking, in a field at least 56px tall with a \`control\` edge; an error turns the edge and the help line \`neg\`.
- It is a password field named \`passcode\` that takes any characters, autocompleting the current password. No numeric-only keypad, so a passcode with letters still works on a phone.
- The help line is a polite live region, and an error moves focus back to the field.
- After 5 wrong tries the help line says until when the passcode is locked.

**Don't:**
- Don't block paste. Password managers fill it.

Source: \`PasscodeInput\` in \`src/web/components.tsx\`.`,
  },
  {
    name: 'Overview',
    group: 'Pages',
    height: 1240,
    width: 1280,
    subtitle: 'the whole first screen on desktop',
    body: (
      <div className="pw-main">
        <Overview snapshot={snapshot} stale={false} />
      </div>
    ),
    readme: `The first screen: the timing tower on the left, the pit board, Positions, Limits, Account and the latest events on the right.

**Provide:** the latest snapshot and its freshness.

**Use:**
- Two columns from 1100px: the tower at \`tower-w\`, the rest beside it. Below 1100px everything stacks: board, tower, screens, events.
- Pause all and Hold to flatten live at the foot of the tower with the system readout.
- When the feed is stale, every figure fades to \`muted\` and the controls stay live.

**Don't:**
- Don't add tiles. Every screen on Overview answers one of three questions: is the bot healthy, what does it hold, how much is it up or down today.

Source: \`Overview\` in \`src/web/screens.tsx\`.`,
  },
];

export const renderCards = () => cards.map(({ body, ...card }) => ({ ...card, html: renderToStaticMarkup(<HeartbeatAgeContext value={2_000}>{body}</HeartbeatAgeContext>) }));
