import { Activity, ArrowLeftRight, Briefcase, Gauge, Layers, OctagonX, Pause } from 'lucide-react';
import type { CSSProperties, ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { evaluateLimits } from '../engine/limits.ts';
import { demoSnapshot } from '../shared/demo.ts';
import type { MarketSession, Strategy, StrategyId } from '../shared/domain.ts';
import { money } from '../shared/format.ts';
import {
  Allocation,
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
  Readout,
  Screen,
  SignedMoney,
  signedFigure,
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
const { account, equityToday, health, positions } = snapshot;
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
    <p className="pw-small pw-muted pw-controls-hint">Pause all keeps positions. Flatten closes them at market after a 2‑second hold and your passcode.</p>
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
- New text slides in like a ticker. When it takes another line, or one fewer, the band eases to its new height (360ms) instead of pushing the app down at once.

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
- The chip is a button. Tapping it opens a popover under it with the whole line: "Market open, closes 16:00 ET." Screen readers hear the same line as its name.
- Where the gantry has no room, the chip folds its next change below 460px, then below 360px any state longer than Open, leaving the light. The popover still holds everything.

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
          <span className="pw-strip" aria-hidden />
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
- The header is \`header-h\` tall on \`surface\`. The PITWALL wordmark is the \`wordmark\` style, expanded against the condensed tabs, followed by a strip of chequered flag in \`fg\`, the gantry's one ornament.
- Tabs use the \`timing\` style in \`muted\`. The current one is \`fg\` with a 3px \`accent\` bar that slides to the new tab.
- Stop is on every screen and never moves.
- The first Tab reaches a hidden "Skip to content" button that moves focus to the page.
- Side padding is the gutter, 16px at a 560px window growing to 24px from 900px, never less than the safe-area inset.
- Below 900px the tabs fade out as the TabBar rises, giving up their width first, and whatever follows them keeps the right edge. Tabs draw closer from 1000px to 900px so the widest MarketChip fits beside them.
- Full screen shows from 1100px and from 600px to 899px, and folds away elsewhere.
- When the gantry runs short, the chequered strip narrows before anything else does, down to nothing. Stop keeps its place and size at every width.

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
- Shown below 900px only, \`tabbar-h\` tall on \`surface\`, padded for the home indicator and side insets. It rises from the bottom edge as its row opens (360ms) and sinks the same way.
- Each tab is a Lucide icon at 18px over a short label in the \`small\` style. The current tab is \`fg\` with a 3px \`accent\` bar on top; the rest are \`muted\`.
- Tabs are links, so the URL hash carries the screen.

**Don't:**
- Don't drop the labels. Icons alone do not say Orders from Events.

Source: \`Shell\` in \`src/web/main.tsx\`.`,
  },
  {
    name: 'PitBoard',
    group: 'Data',
    height: 316,
    width: 900,
    subtitle: 'equity, today, close and high, beside the trace',
    body: (
      <div style={pad}>
        <PitBoard account={account} points={equityToday} events={events} stale={false} />
      </div>
    ),
    readme: `Equity on a pit board: stacked slats with asphalt between them, beside the day's trace.

**Provide:** the account (equity and previous close), today's equity samples, the event log, and whether the feed is stale. The board fetches daily closes itself when a longer range is picked.

**Use:**
- Slat one is equity in \`hero\`, flat on \`surface\`. Slat two is today's change in \`board\` with its percent and ▲ or ▼. Slat three pairs the previous close with the day high.
- The day high and its dot on the trace are \`best\` (sector purple) only when above the previous close. On the trace the high carries its figure and ET time above its dot, and the day low, only when below the previous close, carries them below its \`muted\` dot. Labels near either end hang inward.
- The trace is a single line in \`pos\` or \`neg\` by today's direction against the previous close, a dashed \`control\` line. No area fill, gradient or glow. Times along the axis are ET.
- The axis spans the regular session, 09:30 to 16:00 ET, with a faint line each hour, and widens only if samples fall outside it. The empty part is the time left. A dot marks the latest sample.
- Point at the trace, or focus it and use the arrow keys, Home and End, to scrub it. A dashed \`muted\` cursor snaps to the nearest sample and a readout at the top gives its ET time, equity and change on the day, stopping at the plot's edges. The high and low labels step aside while it shows. Pointer leave, Escape or blur clears it. The plot is a slider whose value text is the readout.
- Warnings, errors and halts in the session stand on the axis rule, under the plot, as 3px flags in the event log's stripe colours, so nothing on the plot covers one. Flags closer than 1.5% of the width merge into the worst. Scrubbing to a flag's sample adds the worst one's severity and whole message to the readout, wrapping where the plot is narrow, with a count of the rest.
- The range bar under the axis picks Today, 1M, 3M, YTD, 1Y or All. The longer ranges load daily closes once per ET date from \`GET /api/equity/daily\` (\`useDailyHistory\` in \`src/web/data.ts\`), end at the live equity and measure against the range's first close. They show dates, month or year lines and no flags or high and low labels. The board loads them when it mounts, so a range opens on its line, and picking one moves the line, baseline, latest dot and grid lines like a camera between the two windows (600ms) instead of redrawing them. \`TraceStroke\` and \`TraceGrid\` run it; \`frameAt\` in \`src/web/morph.ts\` pairs the two lines by time. The axis legend stays centred between end dates of any width. If closes are still loading, or failed, the plot gives way to one line of text and the bar stays, with focus on the pressed range. Picking a range again retries a failed load.
- A change under 0.01% reads "<0.01%", never a signed zero.
- Stale figures and the trace fade to \`muted\`.
- The Equity label carries the privacy eye. With amounts hidden, every money figure on the board and trace blurs in place; the percent, times and the trace's shape stay.

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
        <TimingTower strategies={[spy, qqqPaused, iwmHalted]} limits={strainedLimits} footer={towerFooter} />
      </div>
    ),
    readme: `Strategies ranked like an F1 timing tower, by today's P&L, with their switches, and the emergency controls at its foot.

**Provide:** the strategies, the limits, and on Overview a footer with Pause all, HoldToFlatten, the hint and the SystemReadout.

**Use:**
- The heading is \`heading\` after a slanted tab, like a Screen's.
- Rows show the position in a 32px box, the strategy ID in \`timing\`, today's gain or loss and a switch. Position and gain are \`timing\` stepped up to 21px and heavier, the tower's loudest figures. The gain shrinks with the tower, to 16px at a 288px tower, so the ID keeps one line. The leader's box is inverted to timing white. The leader's gain is \`best\` when it is up and there is more than one strategy.
- A 3px bar beside the position box carries its state, where a timing tower puts the team colour: \`pos\`, \`warn\` or \`flag-red\`. Never a stripe down the row's edge.
- The meta line shows a status value in capitals (RUNNING in \`pos\`, PAUSED in \`warn\`, HALTED as a \`flag-red\` chip), the symbol and fills today. The status value is as wide as RUNNING, so a state change never nudges the symbol after it. A halted row adds the reason verbatim, then labelled figures: Halted at, and each breached limit with its detail. Pass \`limits\` for those.
- The switch is on only while running. Turning it off pauses that strategy at once; turning it on asks first in a ConfirmSheet that names the strategy. The switch is a square hardware toggle: a \`pos\` knob on \`pos-soft\` when on. The knob pulses while the engine applies the command.
- A row flashes its state colour once when its state changes. When the ranking changes, rows slide to their new places (480ms); reduced motion swaps them at once.
- The tower is \`tower-w\` wide on desktop and full width below 1100px. On Overview it stays in view while the page scrolls, when the window is at least 720px tall.
- From 640px wide, as on Strategies, each row reads on one line: position, ID, meta, gain, switch, under column headings in \`small\` \`muted\` with a \`control\` rule. Crossing 640px, the headings fade (240ms) before the rows close up under them, and each row's parts slide to their new places. A wide tower with a footer keeps the controls 360px wide and lays the SystemReadout beside them in three columns.

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
- CPU, disk and memory carry a 10-segment strip under the figure: CPU toward 85°C, where the Pi throttles, disk and memory toward full. The strip takes the cell's warning colour.

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
- The track is a strip of 20 segments. Whole segments light, and any use lights the first one. A new reading fills toward its level over 480ms; reduced motion jumps.
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
    name: 'Allocation',
    group: 'Data',
    height: 268,
    width: 392,
    subtitle: 'positions and cash by market value',
    body: (
      <div style={pad}>
        <Screen title="Account">
          <Allocation positions={positions} cash={account.cash} />
          <Figures
            rows={[
              { label: 'Buying power', value: money(account.buyingPower) },
              { label: 'Cash', value: money(account.cash) },
            ]}
          />
        </Screen>
      </div>
    ),
    readme: `How the account splits between each open position and cash, by market value.

**Provide:** the open positions and the account's cash.

**Use:**
- On Overview it opens the Account screen, above the figures, and closes with a row rule like them.
- One 8px strip. Each position is a segment lit in \`control\`, largest first, then cash unlit in \`border\`. Segments sit 2px apart and never shrink below 2px.
- A key under the strip gives each symbol and cash its percent of the whole, in the same order. The strip is decoration; the key is the content.
- A short counts at its absolute value, and margin debt counts as no cash.

**Don't:**
- Don't colour segments by symbol or by gain. Colour is for flags and figures.

Source: \`Allocation\` in \`src/web/components.tsx\`.`,
  },
  {
    name: 'Readout',
    group: 'Data',
    height: 124,
    width: 1000,
    subtitle: 'the figures a screen opens with',
    body: (
      <div style={pad}>
        <Readout
          cells={[
            { label: 'Running', value: '1' },
            { label: 'Paused', value: '1', className: 'pw-warn' },
            { label: 'Halted', value: '1', className: 'pw-down' },
            { label: 'Today’s P&L', value: signedFigure(412.08), className: 'pw-delta pw-up' },
          ]}
        />
      </div>
    ),
    readme: `The figures a screen is about, in one ruled strip above its table.

**Provide:** cells of a label and a figure already formatted as text, with an optional class for its colour. Add \`pw-amount\` to money, so privacy mode blurs it.

**Use:**
- Positions, Orders & fills and Strategies open with one: a single strip of equal cells ruled apart by hairlines, like the columns of a timing screen, not a row of separate cards. Each cell is a \`small\` \`muted\` label over a figure in \`board\`, flat, with no texture or glow. A count of zero reads \`muted\`.
- The figure shrinks to fit its cell by its length, like the hero, so a long balance still fits two cells a row on a 320px phone.
- Colour follows the figure: a gain or loss carries its sign and glyph in \`pos\` or \`neg\`; a count of paused strategies is \`warn\` and of halted ones or rejected orders \`neg\`, but only above zero.
- Below 900px it shows two cells a row.
- The first slat carries the privacy eye. Pressed, it blurs every figure marked \`pw-amount\` across the app until pressed again, on this device.

**Don't:**
- Don't put a figure here that the screen below does not explain.
- Don't add icons or eyebrow labels. The label is the slat's only words, apart from the privacy eye at the end of the first one.

Source: \`Readout\` in \`src/web/components.tsx\`.`,
  },
  {
    name: 'DataTable',
    group: 'Data',
    height: 800,
    width: 1000,
    subtitle: 'positions and orders',
    body: (
      <div className="pw-main">
        <Positions snapshot={snapshot} stale={false} />
        <div style={{ height: 16 }} />
        <Orders snapshot={snapshot} stale={false} />
      </div>
    ),
    readme: `Positions and orders as plain tables inside a Screen, each under its Readout.

**Provide:** the rows. Positions carry symbol, quantity, average, last, P&L and P&L %; orders carry time, symbol, side, quantity, filled, average fill, status and strategy.

**Use:**
- Headers in \`small\` and \`muted\` on a \`surface-2\` band; cells in \`figure\`; symbols in \`timing\`. Numbers align right.
- A position's P&L % carries a 64px bar against the widest in the table, either side of a zero line, in the figure's colour.
- Rows are \`row-h\` tall and alternate \`surface\` and \`surface-2\`.
- Sides and statuses are status values in capitals. Rejected is \`neg\`, open is \`warn\`, done is \`muted\`. Rejected and open statuses sit in a chip: a border in their colour over its \`-soft\` tint.
- Order times are ET. An order with no strategy reads "manual".
- Orders & fills offers "Download CSV" beside its title: today's orders, newest first, UTC times, formulas defused. Built by \`ordersCsv\` in \`src/shared/orders.ts\`.
- Quantities carry \`pw-amount\`, so privacy mode blurs them; prices stay.
- A position row tints once when its quantity changes.
- Columns draw closer as the window narrows, from 32px apart at 900px to 16px at 560px and 8px at 360px, with the outer edges kept at 16px, so Orders & fills fits a 375px phone. The table scrolls sideways only if it still must, at 320px or with a long strategy ID.
- Below 900px the secondary columns fade out (240ms) and then give up their space, and the other columns slide over to take it, each figure holding its right edge. Wider again, they take their space and fade in.
- Nothing they held is lost: each value rides as a second \`small\` line in the cell beside it, opening as its column fades. Positions puts "avg $571.20" under Last and P&L % under P&L; Orders & fills puts the strategy under the symbol and "12 at $571.20" under the status. The P&L bar is the one thing a phone drops.

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
- The message uses \`body\` and wraps; the source sits under it in \`muted\`, or in its own right-hand column, only as wide as its text, when the log is at least 720px wide. A folded row says how often: "broker, 3 times since 16:47:05".
- WARN, ERROR and HALT carry a 3px by 12px mark in their colour before the severity, the same mark as their flag on the trace. INFO keeps the space, so the words align.
- The full log groups rows under a Screen per day.
- A new row drops in and its tint fades over 1.6s. A repeat folding into a row on screen tints it again without rebuilding or moving it: rows are keyed by the first event of their run.
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
- The face is drawn on \`::before\`, like the tower's, the trace's and every slat's. When a resize moves a panel to another layout, \`glide\` in \`src/web/glide.ts\` slides it there from where it was drawn and grows or shrinks the face to its new size through \`--glide-r\` and \`--glide-b\`.
- The head is 52px tall with the title in \`heading\` after a slanted 5px tab in \`fg\`, and a \`border\` rule under it.
- A Screen wipes in from the left behind a slanted edge when it arrives (460ms), and its rows slide in after it, 40ms apart. On Overview the screens follow the tower and the pit board in reading order. Reduced motion fades them in instead.
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
                <ol className="pw-steps">
                  <li>Pauses every strategy.</li>
                  <li>Cancels 1 open order.</li>
                  <li>Closes 2 positions at market.</li>
                </ol>
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
- It opens by fading and rising (200ms) and leaves by falling 6px and fading with its backdrop (160ms), both on cancel and after a confirmed command. Callers close it through \`leaveSheet\`, so it never just vanishes; reduced motion closes at once.
- \`surface\` with \`radius-md\` and \`shadow-sheet\` over \`scrim\`; it fades and rises in 200ms.
- The body lists the effects in the order the engine applies them, numbered in boxes like tower positions, with live counts: "Cancels 1 open order."
- Focus starts on Cancel, Tab stays inside, Escape or a click on the backdrop cancels, and focus returns to the control that opened it.
- Pause all and Flatten confirm with \`pw-btn-danger\`, and their sheets carry a 4px \`flag-red\` top edge with square top corners; Resume confirms with \`pw-btn-primary\` and has none. Flatten adds a PasscodeInput.
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
- Two columns from 1100px: the tower at \`tower-w\`, the rest beside it. Below 1100px everything stacks: board, tower, screens, events. Crossing either way, every panel slides to its new place and grows or shrinks into its new size.
- Pause all and Hold to flatten live at the foot of the tower with the system readout.
- When the feed is stale, every figure fades to \`muted\` and the controls stay live.

**Don't:**
- Don't add tiles. Every screen on Overview answers one of three questions: is the bot healthy, what does it hold, how much is it up or down today.

Source: \`Overview\` in \`src/web/screens.tsx\`.`,
  },
];

export const renderCards = () => cards.map(({ body, ...card }) => ({ ...card, html: renderToStaticMarkup(<HeartbeatAgeContext value={2_000}>{body}</HeartbeatAgeContext>) }));
