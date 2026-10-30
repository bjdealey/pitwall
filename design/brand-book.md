Pitwall is the monitor and emergency brake for a personal trading bot running on a Raspberry Pi at home. Its world is an F1 pit wall: engineers on the gantry reading live timing screens, a pit board held over the wall, and a flag that tells the whole track how the session is going. In one glance it answers three questions: is the bot healthy, what does it hold, and how much is it up or down today. In two taps it stops the bot.

## Principles

1. **The flag says how the session is going.** One track band under the mode strip carries the session state. It is quiet when all is well. It turns yellow when something is paused or the data is stale, and red when the engine halted. Trouble is loud. Calm is not.
2. **Colour is a flag or a figure, nothing else.** Asphalt and black screens carry the layout. Green, yellow and red are flags and gains or losses. Sector purple marks the best of the session and nothing more. Navigation and focus are timing white, never a flag colour.
3. **Mode is never ambiguous.** The mode strip sits above everything, the sign-in screen included. PAPER is a quiet grey strip. LIVE is an inverted strip that cannot be mistaken for a flag.
4. **Old data says it is old.** When the stream drops or the heartbeat is late, the band goes yellow with the age, and the figures fade to `muted`. Controls stay live.
5. **Stopping is easy; flattening is deliberate.** Stop sits in the gantry on every screen. Flatten is a 2-second hold plus the passcode, at the foot of the timing tower.

## Content

**Voice.** Terse and factual, like a race engineer on the radio. Sentence case for every heading, label and button. Capitals only for status values, the way a timing screen prints PIT or OUT: RUNNING, PAUSED, HALTED, INFO, WARN, ERROR, HALT, and order sides and statuses. No eyebrow labels above headings. No exclamation marks, no emoji, no celebrating gains or consoling losses.

**The theme lives in the visuals, not the words.** The band shows a flag; its text says "2 strategies halted at 04:00.", not "Red flag". Screens are named for what they show: Overview, Positions, Orders & fills, Strategies, Events.

**Say the cause and the effect.** Write "Daily loss limit reached (−2.00%). All strategies paused.", not "Something went wrong." Engine halt reasons appear verbatim. An error you can act on names the next step: "Pitwall API unreachable. Check the Pi is on and Tailscale is connected."

**Buttons are verbs that name the effect**: "Pause all", "Hold to flatten", "Resume", "Review strategies", "Cancel". Confirm titles ask with the same verb: "Pause all strategies?" Never "Are you sure?" and never "OK".

**Lists, not dot-strings.** Related facts sit in their own cells with space between them, never joined with middle dots.

**Numbers.**

| Kind | Format | Example |
| --- | --- | --- |
| Money | `$`, thousands commas, 2 decimals | `$48,213.07` |
| Change | sign, value, percent, glyph | `+$412.08 +0.86% ▲`, `−$96.10 −0.21% ▼` |
| Tiny change | under 0.01% reads `<0.01%`, never a signed zero | `−$1.30 <0.01% ▼` |
| Percent | 2 decimals | `21.40%` |
| Quantity | up to 4 decimals, trailing zeros trimmed | `25`, `0.5`, `0.0125` |
| Zero change | no sign, no glyph, `muted` | `$0.00` |
| Negative | true minus U+2212, never a hyphen or parentheses | `−2.00%` |

**Time.** Market times are always ET and labelled: `opens 09:30 ET`. The event log uses local 24-hour time, `14:32:07`, grouped by date. Durations: `42s`, `3m`, `2h 10m`, `12d`.

**Strategy IDs** appear exactly as in the engine config, kebab-case, in the condensed `timing` style: `sma-cross-spy`.

**Empty states** say what will fill them: "No open positions. Strategies open them on their next signal while the market is open."

**Typography in copy.** Ellipsis `…`, never three dots, and every loading line ends with one: "Waiting for the first engine heartbeat…", "Checking…". Apostrophes and quotes are curly: today’s.

## Colour

There are two themes. **Timing screen** (dark, the default) is an LED gantry at night: graphite asphalt, true-black screens standing on it as slabs, timing-white type. **Timing sheet** (light) is the printed FIA classification: paper-grey page, white screens, black ink. Follow `prefers-color-scheme`.

- **Ground.** `bg` is asphalt, the page and the gaps between pit-board slats. `surface` is every screen. `surface-2` is the raised tone inside a screen: alternate tower, table and event rows, header bands, the market chip and floating readouts. `surface-3` is the cap: the band across the head of each screen and the tower, under the title plate. It is also the face of a default button.
- **Edges.** Nothing is outlined but what you operate. A screen, slat or dialog has no edge of its own: black screens on graphite asphalt stand off it by tone and the side each slab shows. Rows divide by alternating `surface` and `surface-2`, and sections inside a screen by space, never by a rule. `border` is a hairline tone for the chart's grid and axis, meter tracks, unlit segments and position boxes. `control` edges inputs and switches, at 3:1 or better. Buttons have no edge: they stand on plates.
- **Text.** `fg` for primary text and figures, `muted` for units, times, symbols and sources. Both pass 4.5:1 on every ground in both themes.
- **Direction.** `pos` for gains and RUNNING, `neg` for losses and errors. On the timing screen the gain green is 2.6× lighter than the loss red, so the pair holds without hue. Every figure in either colour carries its sign and ▲ or ▼.
- **Flags.** `flag-yellow` and `flag-red` fill the track band, with `on-flag` and `on-flag-red` text. `flag-green` is only ever the flag icon on a calm band. `flag-red` also fills Hold to flatten and the HALTED chip.
- **Sector purple.** `best` marks the day's equity high on the board and trace, and the leading strategy's gain in the tower. Never anything else.
- **State marks.** A 3px mark in the state's colour stands beside what it describes, never as a stripe down a row's edge. A tower row has a bar beside its position box, where a timing tower puts the team colour. An event has a 3px by 12px mark before its severity, the same mark as its flag on the trace. `pos` RUNNING, `warn` PAUSED and WARN, `neg` ERROR, `flag-red` HALTED and HALT. INFO has none.
- **Mode.** `paper` with `on-paper`, and `live` with `on-live`, belong to the mode strip alone.
- **Navigation and focus.** `accent` equals `fg` on purpose: the current tab's plate and the focus outline are timing white (ink on the sheet).

## Type

One variable family, **Archivo**, self-hosted from `@fontsource-variable/archivo` with its width axis. Its width carries the voice:

- **Condensed (75%)** is timing type. `hero` (up to 72px) is the equity figure on the pit board; it scales with the slat and the figure's length, so a seven-figure balance still fits a 320px phone. `board` (36px) is today's change. `heading` (21px, weight 800) titles every screen and the tower, like a broadcast caption, in `surface` on a plate of timing white (ink on the sheet) leaning 20°, on the head's `surface-3` band. `timing` (16px) is the tower and the nav; the tower's positions and gains step up to 21px in it, heavier, as the tower's loudest figures, and on a 320px phone the gain drops back to 16px so the strategy ID keeps one line.
- **Normal width** is for sentences. `body` (16px) holds event messages and dialog copy. `label` (14px) is for buttons, field labels and screen titles. `small` (12px) holds times, symbols, sources and status values.
- **Semi-condensed (87.5%).** `title` (21px) for dialogs, and `figure` (14px) for figures in lists and tables.
- **Expanded (125%).** `wordmark` is the PITWALL wordmark, the one wide thing against all the condensed timing.

Tabular figures are on everywhere, so columns line up without a monospace face. The scale follows the classic steps 12, 14, 16, 21, 36, 72.

## Layout

**Desktop, top to bottom:**

1. The mode strip (`banner-h`).
2. The track band (`track-h`).
3. The gantry header (`header-h`): the wordmark, the five screens as tabs, the market chip, Full screen, and Stop. Full screen shows only where the browser allows it and the gantry has room for it: from 1100px, and from 600px to 899px, where the tabs have moved to the tab bar. A desk monitor or a tablet on a wall can use either.
   When the gantry runs short, it gives up width in this order: the chequered strip narrows to nothing; below 460px the market chip folds its next change; below 360px it folds any state longer than Open, leaving its light. Tapping the chip opens the whole line, "Market closed, opens Mon 09:30 ET.", in a popover under it. Stop keeps its place and size at every width.
4. The page.

**Overview** has two columns:

- **Left: the timing tower** (`tower-w`, black). It ranks strategies by today's P&L, leader first. Each row shows its position in a 32px box filled in `border` (the leader's inverted to timing white), ID, gain and switch, then a meta line: status value, symbol, fills today. A state bar stands beside its position box. A halted row adds its reason and, under it, labelled figures: when it halted and each limit breached now, so the cause reads as numbers, not just a sentence. At the foot of the tower are Pause all and Hold to flatten, and the system readout: engine heartbeat, broker, CPU, disk, memory and uptime. CPU, disk and memory carry a 10-segment strip under the figure, like the limit meters. When the window is at least 720px tall the tower stays in view while the right column scrolls, so the controls never leave the screen.
- **Right, top: the pit board.** Three slats with asphalt between them:
  - equity in `hero`
  - today's change in `board`
  - previous close and day high
  
  Beside the board, the day's trace sits against the previous close as a single line, like a telemetry trace: no area fill, no gradient. Its axis spans the regular session, 09:30 to 16:00 ET, with a faint line each hour, so the trace grows across the day and the empty part is the time left. A dot in the trace's colour marks the latest sample. Like high and low water on a tide chart, the day high (in `best`, only when above the previous close) and the day low (only when below it) carry their figure and time on the curve.
  Pointing at the trace, or focusing it and using the arrow keys, Home and End, scrubs it: a dashed `muted` cursor snaps to the nearest sample and a readout at the top of the plot gives its ET time, equity and change on the day. The readout centres on the cursor and stops at the plot's edges, and the high and low labels step aside while it shows. Pointer leave, Escape or blur clears it. Screen readers get the same readout as the slider's value.
  Warnings, errors and halts in the session stand on the axis as flags: a 3px by 12px stripe in the event log's stripe colour (`warn`, `neg`, `flag-red`). Scrubbing to a flag's sample adds the worst of them to the readout, its severity in caps and its whole message, wrapping where the plot is narrow, with a count of the rest. The Events screen lists them all. Info events get no flag. Flags stand on the axis rule, under the plot, so the line, the dots and the high and low labels never cover one, and a flag never covers them. Flags closer than 1.5% of the plot's width merge into the worst of them, so on a phone none stacks on another.
  Under the axis, a range bar picks the span: Today, 1M, 3M, YTD, 1Y and All, as quiet `muted` words with the chosen one in `surface` on a timing-white plate. Today is the session trace above. The longer ranges draw one daily close per trading day, ending at the live equity, against the range's first close: dates replace ET times, a faint line marks each month start (each year start past about 13 months), dates carry the year once the range crosses one, and the legend reads "First close". They have no flags and no high and low labels, because the board's slats already hold the day's. The range is not kept across reloads, so the board always opens on today.
- **Right, below:** Positions across the full width, then Limits and Account side by side at one height, so their bottom edges meet on one line, then Events.

Limit meters are a strip of 20 segments, like the rev lights on a wheel. Any use lights the first segment, so a limit that has started to fill never reads as empty.

Account opens with the allocation: one strip split by market value, each open position a segment lit in `control` like a meter's fill, largest first, then cash unlit in `border`, with 2px of asphalt between segments. A key under it gives each symbol and cash its percent of the whole. It shows at a glance how much of the account the strategies have put to work, and where.

**Positions, Orders & fills and Strategies** open with a readout: one strip of equal cells on a single face, like the columns of a timing screen, each a `small` label over a figure in `board` that shrinks to fit its cell. A count of zero reads `muted`, so the eye goes to what is happening. Then the screen's table or tower at the full width of the page. Orders & fills offers today's orders as a CSV beside its title, one row per order, newest first, with UTC times and formulas defused for spreadsheets. Strategies shows the tower wide, one line per strategy, under column headings like a standings table: Pos, Strategy, State, Today. Events lists each day at full width, with the source in its own column on the right, only as wide as its text, so messages keep the room and stay on one line down to 720px. Orders & fills and Events show the newest 50 rows, with "Newest 50 of 184" and a "Show 50 older" button at the foot. Older rows open below, so a row arriving at the top never moves what you are reading, the way numbered pages would.

Table headers sit on a `surface-2` band. Beside each position's P&L % a small bar shows it against the widest in the table, right of a zero line for a gain and left for a loss, in the figure's colour. Order statuses that need a look (open in `warn`, REJECTED in `neg`) sit in a chip tinted in the status colour's `-soft`.

**Below 1100px** everything stacks: board, tower, screens, events. The full-width tower keeps Pause all and Hold to flatten at their desktop width and lays the system readout beside them in three columns.

**Below 900px:**

- The tabs move to a bottom tab bar (`tabbar-h`).
- Positions, Limits and Account stack in one column.
- Readouts show two cells a row.
- Table columns draw closer as the window narrows, from 32px apart at 900px to 16px at 560px and 8px at 360px, with the outer edges still on the screen's 16px, so Orders & fills fits a 375px phone without scrolling sideways. Secondary columns fold into the cell beside them as a second `small` line: on Positions, the average price under Last ("avg $571.20", `muted`) and P&L % under P&L in its tone; on Orders & fills, the strategy (or "manual", `muted`) under the symbol, and what filled under the status ("12 at $571.20"). The P&L bar is the one thing a phone drops; its figure stays. A table that is still too wide, at 320px or with a long strategy ID, scrolls sideways rather than cut anything.

**Nothing is lost to a narrow window.** What has no room folds into something nearby, or behind a tap, and says where it went. Nothing is cut off with an ellipsis or dropped outright. Ornament gives way first, then secondary detail, and Stop never does.
- Event rows stack: time and severity first, then the message.

Anything you tap is at least `tap-min` tall. Small text links (Review strategies, All positions, Full log) keep their size and get a `tap-min` hit area around them.

The side gutter grows with the window, from 16px at 560px wide to 24px from 900px, and is never less than the device's safe-area inset, so a phone held sideways keeps the notch clear of the band, the gantry and the page. The tab bar pads for the home indicator. Only the content scrolls: the mode strip, band and gantry never leave the top of the screen.

## Shape and depth

Screens are hardware, nearly square: `radius-sm` (2px) for screens, status chips and inputs, `radius-md` (4px) for dialogs and the skip link, `radius-full` for status lights only. Switches are hardware toggles, `radius-sm` with a square knob: off, a `muted` knob on `surface-2`; on, a `pos` knob on `pos-soft` inside a `pos` edge. Every panel keeps four plain corners, and none clips what sits inside it: labels, flags and focus rings show whole. Depth is extrusion: whatever stands off the page is a slab. Screens, slats, the trace and the sign-in board show `shadow-stack`, a 6px side down and right that darkens away from the face, with no blur. Title plates and the current tab show `shadow-plate`, a 4px side. Buttons, the market chip and the chosen range key show a 4px side in their own face colour, darkened. A readout shows one side for the whole strip. Nothing else on the page has a side, and nothing is ever blurred, except where dialogs and the market chip's popover lift with the soft `shadow-sheet`; dialogs over `scrim`.

Controls stand on plates, like the screen titles. A button, the market chip, the chosen range key and the current tab each sit on a square face leaning 20°, drawn behind upright text, so the tap target stays the box. A default button's face is `surface-3`. Primary (Sign in, Resume) is `fg` with `surface` text. Stop and Pause all are `neg` on `neg-soft`. Danger, the confirm in the Pause all and Flatten sheets, is `flag-red` with `on-flag-red`. Hover widens a button's plate 3px each way, and a default face lifts to `border`.

**Flat.** Figures are flat and crisp, like broadcast timing graphics, on both themes: no glow, bloom, dot grid or other texture behind or around them. Colour carries the meaning, and nothing decorates a figure that already has it. A dialog that stops trading (Pause all, Flatten) carries a 4px `flag-red` top edge with square top corners, and lists its effects as numbered steps in boxes like tower positions.

Sign-in is a pit board too: the wordmark at 32px on one slat, the passcode and Sign in on the next, asphalt between.

## Focus

Every control shows a 2px `accent` outline with a 2px offset on `:focus-visible`. A button's outline traces its plate, so it leans with it. Inside the track band the outline takes the band's ink (`currentColor`), because timing white vanishes on the yellow flag.

The first Tab on every screen reaches "Skip to content", which moves focus to the page without touching the route. Dialogs are native modal `<dialog>`s: focus starts on Cancel, Tab stays inside, Escape or a click on the backdrop cancels, and focus returns to the control that opened them. A wrong passcode moves focus back to the field.

## Motion

Motion reports something or it does not run, and nothing just appears: arriving is something to report. Prices never flash on ticks. The whole list:

- **Heartbeat pulse.** The engine light in the tower's system readout sends out one ring each time a heartbeat arrives, every 5s. It stops when data goes stale.
- **Track band.** Its colour crossfades (400ms) when the session state changes, the flag rises into place and the new text slides in from the left like a ticker (360ms). When the new text takes another line, or one fewer, the band eases to its new height over the same 360ms, so the app below glides instead of jumping. The text stays mounted, so its live region still announces.
- **Screen change.** The current tab's plate slides to the new tab (280ms), using View Transitions where the browser has them. The old page does not cross-fade; the new one builds.
- **Entrance.** A screen builds like a broadcast graphic, the first time it shows and on every screen change:
  - Panels (screens, the tower, the trace and slats) wipe in from the left behind an edge slanted like the title plates (460ms), in reading order, 40 to 60ms apart: on Overview the tower, then the pit board's slats and trace, then Positions, Limits, Account and Events.
  - Rows (tower rows, table rows, events, figure rows, meters and system readings) slide 12px in from the left and fade up after their panel, 40ms apart; rows past the seventh arrive with the seventh, so a long log never trickles in.
  - Board figures rise into their slats. Meters and P&L bars fill from zero. The allocation strip wipes across.
  - The trace draws across its span from left to right (800ms), then its latest dot, high and low labels fade in and its flags rise from the axis. Picking a range moves the trace like a camera between the two windows (600ms) instead of redrawing it: each moment on the line slides from where it sat to where it lands, the baseline and latest dot go with it, a grid line both ranges share slides to its new place, and the others fade in or out as they slide from or to where their moment sits.
  - Empty states, loading lines, errors and the market chip's state fade in (240ms).
  Each runs once, when its element arrives. Ticks re-render without replaying any of it.
- **Holding place.** Changed content updates in place. Rows are keyed by what they are (a symbol, an order, a strategy, the first event of a folded run), never by a value that changes, so a new quantity or a repeat never rebuilds its row. Labels keep their place while the words beside them change: a status value is as wide as RUNNING, and the trace axis keeps its legend centred however wide its end dates are.
- **Resizing.** Dragging a window from one layout to the next never makes anything jump or pop.
  - Gutters, gaps, table spacing, the trace's height and the tower's gain grow and shrink with the window, so most of the page simply follows it.
  - Whatever a breakpoint, a container query or a grid that fits one column fewer moves to another place slides there from where it was drawn, and a panel grows or shrinks its face to its new size on the way (most of the way in 250ms, settled by 600ms). Rows slide inside their panel and the pieces of a row inside the row, and a figure set at its column's right edge holds that edge.
  - What a layout drops fades out (240ms) and then gives up its space, which closes with the same slide: the gantry's tabs, secondary table columns, the tower's column headings. What it adds takes its space and fades in.
  - The tab bar rises from the bottom edge as its row opens (360ms) and sinks the same way. Full screen and the market chip's next change and state fold away to nothing, and the chequered strip narrows with the window. As a secondary column fades, its value opens as a second line in the cell beside it (240ms), and closes the same way.
- **Hold to flatten.** The fill tracks the 2s press, the button sinks 3px into its side, the label reads "Keep holding…", and an early release eases the fill back (240ms).
- **Pending command.** A strategy switch pulses its knob while the engine applies the command. It stays focusable (`aria-disabled`, not `disabled`), so focus is never lost and a stale engine never locks it.
- **State change.** When a strategy's state changes, its status value pops in and its tower row flashes the state colour once (1.4s).
- **Overtake.** When the ranking changes, each tower row slides from its old place to its new one (480ms), the row gaining places passing over the one it overtakes.
- **Meter reading.** Limit and system meters fill toward a new reading (480ms), lighting segment by segment.
- **New row.** An event, order or position that arrives while you watch drops in (240ms), and its time, or a new position's symbol, stands on a timing-white plate for 10s before the plate fades (600ms) and the text takes back its colour. A new event row also tints and settles (1.6s). A repeat that folds into a row already on screen tints it again and puts its new time on a plate, and the row stays where it is. Rows already on screen when the list opened never animate.
- **Feedback.** Buttons sink 3px into their side when pressed (120ms), and their plate widens on hover (150ms). Dialogs fade and rise (200ms) over a backdrop that fades in (160ms), and leave by falling 6px and fading with their backdrop (160ms), whether cancelled or confirmed. Privacy mode blurs and unblurs amounts over 240ms. Range presets ease onto their plate (150ms). Figures fade to `muted` when stale (300ms). A position row tints when its quantity changes (600ms).

Easing is `cubic-bezier(.16, 1, .3, 1)` for arrivals, and exits run faster than entrances. Moving things animate `transform` and `opacity`, and wipes and the trace draw animate `clip-path`: row tints and flashes are a layer behind the row that fades out, never an animated background. Colour changes on the track band and on controls may crossfade. Under `prefers-reduced-motion` nothing moves: entrances become fades in the same order, meters and bars show their reading at once, sheets leave at once, the pulse becomes a glow, row tints stay, the hold fill still tracks the press, and a resize moves nothing: what a layout drops or adds only fades.

## Privacy mode

The eye at the end of the Equity slat, and of each readout's first slat, blurs every amount of money and every quantity the account holds or trades: equity, today's change, the previous close and day high, the trace's labels and readout, buying power and cash, P&L in dollars, position and order quantities, and the daily loss limit's dollar detail. Prices, percentages, times, counts and statuses stay readable, because they are the same for everyone. Figures blur in place, so nothing moves. The choice is kept on the device, so a wall screen or a phone on the train stays hidden after a reload.

It is visual only. Screen readers, the event log's messages, the dialogs and the orders CSV still give full figures, because you need them to act.

## States

| State | Track band | Elsewhere |
| --- | --- | --- |
| All running, market open | Calm band, green flag icon, "All 2 strategies running." | — |
| Market closed, pre-market or after-hours | Calm band, chequered flag | — |
| One or more paused by you | Yellow band, "Review strategies" | Tower rows show PAUSED and the time |
| Stale: no snapshot for 3s, or heartbeat older than 15s | Yellow band, "No engine data.", with the last heartbeat's age in the detail | Figures fade to `muted`; controls stay enabled |
| Halted: the engine paused itself on a limit | Red band with the reason and "Review strategies" | Tower rows show a red HALTED chip and the reason |
| Locked out after 5 wrong passcodes | — | The passcode field says until when |

## Screen readers

- **The band speaks once per change.** Only its headline is a live region, and the headline holds no counter, so a stale band is announced once, not every second. The detail stays readable but silent.
- **Flatten has a path without the hold.** Assistive tech activates a button with a click, not a press, so a click with no pointer behind it opens the passcode sheet directly. The passcode still guards it.
- **Identifiers stay untranslated.** The wordmark, symbols and strategy IDs carry `translate="no"`.
- **Errors are announced.** The passcode help line is a polite live region, and dialog and tower errors are alerts.

## Iconography

Lucide, from `lucide-react`, at 18px in `currentColor`, always beside a word. The tab bar uses `gauge`, `briefcase`, `arrow-left-right`, `layers` and `activity`. Stop uses `octagon-x`, Pause all uses `pause`, Full screen uses `maximize` or `minimize` while the page fills the screen. The privacy eye, `eye` or `eye-off` while amounts are hidden, is the one icon without a word beside it: it sits at the end of a slat's label, named and titled "Hide amounts", and its tap target reaches 44px. The flag icon in the track band is drawn in the app: a pole and a cloth, solid or chequered.

There is no logo mark. The brand is the PITWALL wordmark in `wordmark` style. In the gantry a strip of chequered flag, two rows of 5px squares in timing white (ink on the sheet), follows it: the gantry's one ornament. When the gantry runs short, the strip narrows before anything else gives up width, down to nothing, so the market chip and Stop always fit. The home-screen icon is the letter P in Archivo 800, expanded like the wordmark, timing white on asphalt.
