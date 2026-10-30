# Product brief

These are the decisions the interface depends on. Build screens against them and do not invent controls beyond them.

## What it is

- One operator, one bot, one Raspberry Pi 5 (4–8 GB) that boots from an SSD.
- The bot trades US equities through Alpaca. Crypto may come later through the same broker.
- v1 runs on Alpaca's paper account with one example strategy, `sma-cross-spy`.
- Live trading is a config flag on the Pi. The UI can never switch modes. It only shows the ModeStrip.

## Processes

- `pitwall-engine` runs strategies, talks to Alpaca, enforces the risk limits, and writes everything to SQLite.
- `pitwall-api` serves the dashboard's static build, one Server-Sent Events stream, and POST endpoints for controls.
- Both are systemd units with `Restart=always`. A dashboard crash never stops trading.
- Stack: TypeScript everywhere. Vite and React for the UI, Hono for the API, Drizzle on SQLite shared by both processes.

## Access

- Tailscale only, with no open ports. `tailscale serve` provides HTTPS on the `*.ts.net` name.
- The dashboard is installable as a PWA: a manifest and an icon. There is no offline cache, because stale trading data is worse than none.
- Passcode sign-in: an argon2 hash in the Pi's env file, a 30-day HttpOnly cookie per device, and a lockout after 5 failures. Flatten always asks for the passcode again.

## Controls

- **Pause all:** no new orders, cancel open orders, keep positions.
- **Flatten:** Pause all, then a market close of every position.
- **Per-strategy pause and resume.** Resume is never automatic and never in bulk.
- **Automatic halts** are the same action as Pause all, with a reason, except that a halted strategy's stop and flat-by still close its position:
  - the daily loss limit (for example −2% of equity)
  - N rejected orders in a row
  - broker silence past a timeout

  Each halt is shown as a LimitMeter.
- **Daily trade cap:** blocks new entries only and does not halt. It is shown as a LimitMeter too.

## Screens (v1)

1. **Overview:** the timing tower with Pause all, Hold to flatten and the system readout; the pit board with today's trace; Positions, Limits and Account screens; the latest events
2. **Positions**
3. **Orders & fills**
4. **Strategies:** state, today's P&L, pause or resume
5. **Events:** halts, errors, warnings, your own actions

Above every screen sit the ModeStrip and the TrackBand, which flags the session: calm when all runs, yellow when something is paused or stale, red when the engine halted.

Deferred: equity-curve history beyond today, a trade journal, backtest results.

## Alerts

The engine POSTs to ntfy for halts, engine down and errors. Alerts for fills are opt-in.

## Health

The SystemReadout at the foot of the timing tower shows engine heartbeat age, broker connection, Pi CPU temperature (with throttling), disk use, memory use and uptime.

## Data

- Keep orders, fills, halts and daily equity forever.
- Prune heartbeats and health samples after 30 days.
- Run a nightly `sqlite3 .backup` to the Mac or NAS over Tailscale.
