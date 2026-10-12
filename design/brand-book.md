Pitwall is the monitor and emergency brake for a personal trading bot running on a Raspberry Pi at home. You open it on your phone over Tailscale. In one glance it must answer three questions: is the bot healthy, what does it hold, and how much is it up or down today. In two taps it must let you stop the bot. It is an instrument, not a trading app. It uses calm graphite surfaces, and color appears only when it means something.

## Principles

1. **Color means something or it is absent.** Neutrals carry the layout. `pos`, `neg`, `warn`, `live` and `paper` each have one meaning. `accent` is for focus and navigation, never data.
2. **Mode is never ambiguous.** The ModeBanner (PAPER or LIVE) sits above the header on every screen, the sign-in screen included.
3. **Old data says it is old.** When the stream drops, the StaleChip appears and figures go `muted`. A number on screen is current or labeled stale.
4. **Stopping is easy; flattening is deliberate.** Pause all is one tap plus a confirm, from any screen. Flatten is a 2 s hold plus the passcode, on Overview only.
5. **Numbers line up.** Every figure is set in Plex Mono with tabular digits.

## Content

**Voice.** Terse and factual, like an operator's log. Sentence case for prose. UPPERCASE only for state words: RUNNING, PAUSED, HALTED, OPEN, PRE, AFTER, CLOSED, STALE, PAPER, LIVE. No exclamation marks, no emoji, no celebrating gains or consoling losses.

**Say the cause and the effect.** Write "Daily loss limit reached (−2.00%). All strategies paused.", not "Something went wrong." Engine halt reasons appear verbatim.

**Buttons are verbs that name the effect**: "Pause all", "Hold to flatten", "Resume sma-cross-spy", "Cancel". Confirm titles ask with the same verb: "Pause all strategies?" Never "Are you sure?" and never "OK".

**Numbers.**

| Kind | Format | Example |
| --- | --- | --- |
| Money | `$`, thousands commas, 2 decimals | `$48,213.07` |
| Change | sign, value, percent, glyph | `+$412.08 +0.86% ▲`, `−$96.10 −0.21% ▼` |
| Percent | 2 decimals | `21.40%` |
| Quantity | up to 4 decimals, trailing zeros trimmed | `25`, `0.5`, `0.0125` |
| Zero change | no sign, no glyph, `muted` | `$0.00` |
| Negative | true minus U+2212, never a hyphen or parentheses | `−2.00%` |

**Time.** Market times are always ET and labeled: `opens 09:30 ET`. The event log uses local 24-hour time, `14:32:07`, grouped by date. Durations: `42s`, `3m`, `2h 10m`, `12d`.

**Strategy IDs** appear exactly as in the engine config, kebab-case, in mono: `sma-cross-spy`.

**Empty states** are one `muted` `body` sentence with no illustration: "No open positions." "No events today."

## Color

The dark theme comes first and is the default. The light theme is for daylight. Follow `prefers-color-scheme` and allow a manual override in Settings.

- **Ground:** `bg` for the page, `surface` for cards, tables, the header, the tab bar and sheets, `surface-2` for hover, meter tracks and quiet tags.
- **Edges:** `border` for hairlines. `control` for anything you operate (inputs, switches, secondary buttons). `control` holds 3:1 on every ground in both themes, and `border` is never a control's only edge.
- **Text:** `fg` for primary text and figures. `muted` for labels, units, timestamps and stale figures. Both pass 4.5:1 on `bg`, `surface` and `surface-2` in both themes.
- **Direction:** `pos` for gains, `neg` for losses. They are green and red, and they also differ in lightness by 2.3:1 in both themes, so they stay distinct without hue. A figure in `pos` or `neg` always carries its sign and ▲ or ▼. `pos-soft` and `neg-soft` are tag grounds only.
- **Attention:** `warn` for STALE, WARN events and meters past 75%, on `warn-soft` for chips and tags.
- **Danger fills:** Pause all is a `neg` outline. Flatten is a `neg` fill with `on-neg` text.
- **Money mode:** `live` with `on-live` and `paper` with `on-paper` belong to the ModeBanner alone. LIVE is loud amber in both themes on purpose.
- **Navigation and focus:** `accent` (with `on-accent` on a fill) for the focus ring, links and the active-tab bar.
- **Overlay:** `scrim` behind the ConfirmSheet.

## Type

Two families from IBM Plex: **Plex Sans** for words, **Plex Mono** for every number, ID, timestamp and state word.

- `title` for screen and sheet titles. `body` for sentences. `label` for buttons, field labels, tab labels and table symbols. `caption` for uppercase tile labels and table headers, always `muted`.
- `figure-xl` for the one hero number per StatTile. `figure-lg` for secondary tile figures and the passcode field. `figure` for table cells and inline deltas. `figure-sm` for timestamps, chips, tags, the ModeBanner and health readouts.
- `wordmark` for the PITWALL wordmark in the header, and nowhere else.

The app self-hosts the woff2 files on the Pi so pages never depend on a font CDN. This system loads them from Google Fonts for its previews.

## Space and layout

The base unit is 4px: `space-1` (4), `space-2` (8), `space-3` (12), `space-4` (16), `space-6` (24). There are no values in between.

**Phone first.** One column with `space-4` gutters. From top to bottom:

1. ModeBanner (`banner-h`)
2. Header (`header-h`): the wordmark, the MarketChip, the StaleChip when stale, and the compact Stop button
3. The screen
4. TabBar (`tabbar-h`)

Sections on a screen sit `space-6` apart.

**Overview, top to bottom:**

1. StatTiles: Equity with Sparkline, Today P&L, Open positions, Buying power
2. LimitMeters
3. HealthStrip
4. Pause all
5. Hold to flatten

**Density.** Overview is glanceable, with one big number per tile. Positions and Orders & fills are compact DataTables at `row-h`.

**Desktop (900px and up).** The TabBar becomes a left rail, tiles go 2 or 3 columns, and tables show every column.

**Touch.** Anything you tap is at least `tap-min` tall.

## Shape and elevation

`radius-sm` for tags and inputs. `radius-md` for cards, buttons and the sheet's top corners. `radius-full` for chips, switches, meter tracks and dots. Use borders, not shadows: a card is `surface` plus a 1px `border`. Only the ConfirmSheet floats, with `shadow-sheet` over `scrim`.

## Focus

Every control uses `focus-ring` on `:focus-visible`: a 2px `bg` gap, then 2px solid `accent`. That is 8:1 on `bg` in dark and 5.2:1 in light.

## Motion

Almost none. Prices never flash on ticks. The whole list:

- a 150ms `surface-2` tint fade on a position row when its quantity changes (`pw-changed`)
- a 150ms switch knob slide
- a 200ms ConfirmSheet slide-up
- the Flatten hold fill, which tracks the press

Under `prefers-reduced-motion`, all of these are off except the hold fill.

## States

- **Stale:** the SSE stream drops, or the last heartbeat is older than 15 s (3× the 5 s interval). The StaleChip shows the age, figures go `muted`, and Sparklines go flat. Controls stay enabled.
- **Halted:** the engine paused itself on a limit. Overview shows the halt reason in an EventRow above the tiles. Affected StrategyRows show HALTED with the reason.
- **Paused by you:** the StrategyRow shows PAUSED with "by you" and the time.
- **Locked out:** after 5 wrong passcodes, the PasscodeInput says until when.

## Iconography

Use Lucide at 20px, 1.5px stroke, round caps and joins, in `currentColor`, imported from `lucide-react` in the app. Pair an icon with a word everywhere: the Stop button says "Stop" and tabs have labels.

| Use | Icon |
| --- | --- |
| Overview | `home` |
| Positions | `briefcase` |
| Orders | `arrow-left-right` |
| Strategies | `layers` |
| Events | `activity` |
| Pause all | `pause` |
| Stop / Flatten | `octagon-x` |
| Stale | `clock` |

The previews here inline hand-copied Lucide geometry, and a few paths may differ slightly from the current package. The package is the source.

There is no logo mark. The brand is the PITWALL wordmark in `wordmark` style. The PWA home-screen icon is the letter P in Plex Mono 600, `fg` on `bg`.
