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

There are two themes. **Timing screen** (dark, the default) is an LED gantry at night: near-black asphalt, true-black screens each drawn by a hairline bezel, timing-white type. **Timing sheet** (light) is the printed FIA classification: paper-grey page, white screens, black ink. Follow `prefers-color-scheme`.

- **Ground.** `bg` is asphalt, the page and the gaps between pit-board slats. `surface` is every screen. `surface-2` is the alternate tower row and table row.
- **Edges.** `border` is the bezel inside and around screens: every screen, slat and dialog has a 1px `border` edge, so the layout reads as mounted hardware, not as cards on a grey page. `control` edges anything you operate, at 3:1 or better.
- **Text.** `fg` for primary text and figures, `muted` for units, times, symbols and sources. Both pass 4.5:1 on every ground in both themes.
- **Direction.** `pos` for gains and RUNNING, `neg` for losses and errors. On the timing screen the gain green is 2.6× lighter than the loss red, so the pair holds without hue. Every figure in either colour carries its sign and ▲ or ▼.
- **Flags.** `flag-yellow` and `flag-red` fill the track band, with `on-flag` and `on-flag-red` text. `flag-green` is only ever the flag icon on a calm band. `flag-red` also fills Hold to flatten and the HALTED chip.
- **Sector purple.** `best` marks the day's equity high on the board and trace, and the leading strategy's gain in the tower. Never anything else.
- **Stripes.** A 3px stripe down the left edge of a tower row or event row carries its state, like a team colour on a timing tower: `pos` RUNNING, `warn` PAUSED and WARN, `neg` ERROR, `flag-red` HALTED and HALT. INFO rows have none.
- **Mode.** `paper` with `on-paper`, and `live` with `on-live`, belong to the mode strip alone.
- **Navigation and focus.** `accent` equals `fg` on purpose: the active nav bar and the focus outline are timing white (ink on the sheet).

## Type

One variable family, **Archivo**, self-hosted from `@fontsource-variable/archivo` with its width axis. Its width carries the voice:

- **Condensed (75%)** is timing type. `hero` (up to 72px) is the equity figure on the pit board; it scales with the slat and the figure's length, so a seven-figure balance still fits a 320px phone. `board` (36px) is today's change. `timing` (16px) is the tower and the nav.
- **Normal width** is for sentences. `body` (16px) holds event messages and dialog copy. `label` (14px) is for buttons, field labels and screen titles. `small` (12px) holds times, symbols, sources and status values.
- **Semi-condensed (87.5%).** `title` (21px) for the tower heading and dialogs, and `figure` (14px) for figures in lists and tables.
- **Expanded (125%).** `wordmark` is the PITWALL wordmark, the one wide thing against all the condensed timing.

Tabular figures are on everywhere, so columns line up without a monospace face. The scale follows the classic steps 12, 14, 16, 21, 36, 72.

## Layout

**Desktop, top to bottom:**

1. The mode strip (`banner-h`).
2. The track band (`track-h`).
3. The gantry header (`header-h`): the wordmark, the five screens as tabs, the market chip, and Stop.
4. The page.

**Overview** has two columns:

- **Left: the timing tower** (`tower-w`, black). It ranks strategies by today's P&L, leader first. Each row shows its position in a box (the leader's inverted to timing white), ID, gain and switch, then a meta line: status value, symbol, fills today. A state stripe runs down its left edge. A halted row adds its reason and, under it, labelled figures: when it halted and each limit breached now, so the cause reads as numbers, not just a sentence. At the foot of the tower are Pause all and Hold to flatten, and the system readout: engine heartbeat, broker, CPU, disk, memory and uptime. CPU, disk and memory carry a 10-segment strip under the figure, like the limit meters. When the window is at least 720px tall the tower stays in view while the right column scrolls, so the controls never leave the screen.
- **Right, top: the pit board.** Three slats with asphalt between them:
  - equity in `hero`
  - today's change in `board`
  - previous close and day high
  
  Beside the board, the day's trace sits against the previous close as a single line, like a telemetry trace: no area fill, no gradient. Its axis spans the regular session, 09:30 to 16:00 ET, with a faint line each hour, so the trace grows across the day and the empty part is the time left. A dot in the trace's colour marks the latest sample. Like high and low water on a tide chart, the day high (in `best`, only when above the previous close) and the day low (only when below it) carry their figure and time on the curve.
- **Right, below:** Positions across the full width, then Limits and Account side by side at one height, so their bottom edges meet on one line, then Events.

Limit meters are a strip of 20 segments, like the rev lights on a wheel. Any use lights the first segment, so a limit that has started to fill never reads as empty.

**Positions, Orders & fills and Strategies** open with a readout: equal slats with asphalt between them, a `small` label over a figure in `board` that shrinks to fit its slat. Then the screen's table or tower at the full width of the page. Strategies shows the tower wide, one line per strategy, under column headings like a standings table: Pos, Strategy, State, Today. Events lists each day at full width, with the source in its own column on the right, only as wide as its text, so messages keep the room and stay on one line down to 720px.

Table headers sit on a `surface-2` band. Beside each position's P&L % a small bar shows it against the widest in the table, right of a zero line for a gain and left for a loss, in the figure's colour. Order statuses that need a look (open in `warn`, REJECTED in `neg`) sit in a chip: a 1px border in the status colour over its `-soft` tint.

**Below 1100px** everything stacks: board, tower, screens, events. The full-width tower keeps Pause all and Hold to flatten at their desktop width and lays the system readout beside them in three columns.

**Below 900px:**

- The tabs move to a bottom tab bar (`tabbar-h`).
- The market chip shows its state only.
- Positions, Limits and Account stack in one column.
- Readouts show two slats a row.
- Table columns sit 16px apart instead of 32px, with the outer edges still on the screen's 16px, so Orders & fills fits a 375px phone without scrolling sideways. Below 360px they sit 8px apart.
- Event rows stack: time and severity first, then the message.

Anything you tap is at least `tap-min` tall. Small text links (Review strategies, All positions, Full log) keep their size and get a `tap-min` hit area around them.

The side gutter is 24px on desktop and 16px below 900px, and never less than the device's safe-area inset, so a phone held sideways keeps the notch clear of the band, the gantry and the page. The tab bar pads for the home indicator. Only the content scrolls: the mode strip, band and gantry never leave the top of the screen.

## Shape and depth

Screens are hardware, nearly square: `radius-sm` (2px) for screens, chips and inputs, `radius-md` (4px) for buttons and dialogs, `radius-full` for status lights only. Switches are hardware toggles, `radius-sm` with a square knob: off, a `muted` knob on `surface-2`; on, a `pos` knob on `pos-soft` inside a `pos` edge. There are no shadows on the page. Depth is a hairline bezel and asphalt showing between black screens. Only dialogs lift, with `shadow-sheet` over `scrim`. A dialog that stops trading (Pause all, Flatten) carries a 4px `flag-red` top edge with square top corners, and lists its effects as numbered steps in boxes like tower positions.

Sign-in is a pit board too: the wordmark at 32px on one slat, the passcode and Sign in on the next, asphalt between.

## Focus

Every control shows a 2px `accent` outline with a 2px offset on `:focus-visible`. Inside the track band the outline takes the band's ink (`currentColor`), because timing white vanishes on the yellow flag.

The first Tab on every screen reaches "Skip to content", which moves focus to the page without touching the route. Dialogs are native modal `<dialog>`s: focus starts on Cancel, Tab stays inside, Escape or a click on the backdrop cancels, and focus returns to the control that opened them. A wrong passcode moves focus back to the field.

## Motion

Motion reports something or it does not run. Prices never flash on ticks. The whole list:

- **Heartbeat pulse.** The engine light in the tower's system readout sends out one ring each time a heartbeat arrives, every 5s. It stops when data goes stale.
- **Track band.** Its colour crossfades (400ms) when the session state changes.
- **Screen change.** The active tab bar slides to the new tab (280ms), using View Transitions where the browser has them. The page itself switches at once, like a timing feed: no fade, no rise.
- **Hold to flatten.** The fill tracks the 2s press, the button settles to 98.5%, the label reads "Keep holding…", and an early release eases the fill back (240ms).
- **Pending command.** A strategy switch pulses its knob while the engine applies the command. It stays focusable (`aria-disabled`, not `disabled`), so focus is never lost and a stale engine never locks it.
- **State change.** When a strategy's state changes, its status value pops in and its tower row flashes the state colour once (1.4s).
- **Overtake.** When the ranking changes, each tower row slides from its old place to its new one (480ms), the row gaining places passing over the one it overtakes.
- **Meter reading.** Limit and system meters fill toward a new reading (480ms), lighting segment by segment.
- **New event.** A newly arrived event row tints and settles (1.6s).
- **Feedback.** Buttons press to 98%. Dialogs fade and rise (200ms) over a backdrop that fades in (160ms). Figures fade to `muted` when stale (300ms). A position row tints when its quantity changes (600ms).

Easing is `cubic-bezier(.16, 1, .3, 1)` for arrivals, and exits run faster than entrances. Moving things animate `transform` and `opacity` only: row tints and flashes are a layer behind the row that fades out, never an animated background. Colour changes on the track band and on controls may crossfade. Under `prefers-reduced-motion` nothing moves: entrances become fades, the pulse becomes a glow, row tints stay, and the hold fill still tracks the press.

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

Lucide, from `lucide-react`, at 18px in `currentColor`, always beside a word. The tab bar uses `gauge`, `briefcase`, `arrow-left-right`, `layers` and `activity`. Stop uses `octagon-x`, Pause all uses `pause`. The flag icon in the track band is drawn in the app: a pole and a cloth, solid or chequered.

There is no logo mark. The brand is the PITWALL wordmark in `wordmark` style. The home-screen icon is the letter P in Archivo 800, expanded like the wordmark, timing white on asphalt.
