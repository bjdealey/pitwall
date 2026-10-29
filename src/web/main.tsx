import '@fontsource-variable/archivo/wdth.css';
import './tokens.css';
import './pitwall.css';
import { Activity, ArrowLeftRight, Briefcase, Gauge, Layers, OctagonX } from 'lucide-react';
import { StrictMode, useEffect, useRef, useState, type FormEvent } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { HeartbeatAgeContext, MarketChip, ModeStrip, PasscodeInput, PrivacyContext, TrackBand, trackStatus, usePrivacy } from './components.tsx';
import { DEMO, freshness, postJson, useNow, usePost, useSnapshot } from './data.ts';
import { Events, Orders, Overview, PauseAllSheet, Positions, Strategies } from './screens.tsx';

const ROUTES = [
  { hash: '#/', label: 'Overview', short: 'Overview', Icon: Gauge, Screen: Overview },
  { hash: '#/positions', label: 'Positions', short: 'Positions', Icon: Briefcase, Screen: Positions },
  { hash: '#/orders', label: 'Orders & fills', short: 'Orders', Icon: ArrowLeftRight, Screen: Orders },
  { hash: '#/strategies', label: 'Strategies', short: 'Strategies', Icon: Layers, Screen: Strategies },
  { hash: '#/events', label: 'Events', short: 'Events', Icon: Activity, Screen: Events },
] as const;

function useRoute() {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    const onChange = () => {
      const update = () => flushSync(() => setHash(location.hash));
      if (!document.startViewTransition || matchMedia('(prefers-reduced-motion: reduce)').matches) return update();
      // A second tap before the first animation ends skips it; that rejection is expected, not an error.
      document.startViewTransition(update).ready.catch(() => {});
    };
    addEventListener('hashchange', onChange);
    return () => removeEventListener('hashchange', onChange);
  }, []);
  return ROUTES.find((r) => r.hash === hash) ?? ROUTES[0];
}

function Shell({ onSignedOut }: { onSignedOut: () => void }) {
  const feed = useSnapshot(onSignedOut);
  const now = useNow();
  const route = useRoute();
  const mainRef = useRef<HTMLElement>(null);
  const [pausing, setPausing] = useState(false);
  const privacy = usePrivacy();
  const { stale, heartbeatAgeMs } = feed ? freshness(feed, now) : { stale: true, heartbeatAgeMs: Infinity };
  const status = trackStatus(feed ? { strategies: feed.snapshot.strategies, market: feed.snapshot.market, stale, heartbeatAgeMs } : null);
  useEffect(() => {
    document.title = `${route.label} · Pitwall`;
  }, [route.label]);

  return (
    <div className={`pw-app ${privacy.hidden ? 'pw-private' : ''}`}>
      <button type="button" className="pw-skip pw-label" onClick={() => mainRef.current?.focus()}>
        Skip to content
      </button>
      <ModeStrip mode={feed?.snapshot.mode ?? null} />
      <TrackBand status={status} />
      <header className="pw-gantry">
        <span className="pw-wordmark" translate="no">
          PITWALL
        </span>
        <nav className="pw-nav" aria-label="Screens">
          {ROUTES.map(({ hash, label }) => (
            <a key={hash} href={hash} className="pw-nav-item pw-timing" aria-current={hash === route.hash ? 'page' : undefined}>
              {label}
              {hash === route.hash && <span className="pw-nav-pill" aria-hidden />}
            </a>
          ))}
        </nav>
        {feed && <MarketChip market={feed.snapshot.market} now={now} />}
        <button type="button" className="pw-btn pw-btn-stop pw-btn-compact" onClick={() => setPausing(true)}>
          <OctagonX className="pw-icon" aria-hidden />
          <span>Stop</span>
        </button>
      </header>
      <main ref={mainRef} className="pw-content" tabIndex={-1}>
        <h1 className="pw-sr">{route.label}</h1>
        <div className="pw-main">
          {feed ? (
            <HeartbeatAgeContext value={heartbeatAgeMs}>
              <PrivacyContext value={privacy}>
                <route.Screen snapshot={feed.snapshot} stale={stale} />
              </PrivacyContext>
            </HeartbeatAgeContext>
          ) : (
            <p className="pw-waiting pw-label pw-muted">Waiting for the first engine heartbeat…</p>
          )}
        </div>
      </main>
      <nav className="pw-tabbar" aria-label="Screens">
        {ROUTES.map(({ hash, short, Icon }) => (
          <a key={hash} href={hash} className="pw-tab pw-small" aria-current={hash === route.hash ? 'page' : undefined}>
            {hash === route.hash && <span className="pw-tab-pill" aria-hidden />}
            <Icon className="pw-icon" aria-hidden />
            {short}
          </a>
        ))}
      </nav>
      {pausing && <PauseAllSheet snapshot={feed?.snapshot ?? null} onClose={() => setPausing(false)} />}
    </div>
  );
}

function SignIn({ onSignedIn }: { onSignedIn: () => void }) {
  const [passcode, setPasscode] = useState('');
  const { error, attempt, busy, send } = usePost(() => postJson('/api/login', { passcode }), onSignedIn);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    send();
  };
  return (
    <div className="pw-login">
      <ModeStrip mode={null} />
      <form className="pw-login-form" onSubmit={submit}>
        <div className="pw-login-board pw-login-mark">
          <h1 className="pw-wordmark" translate="no">
            PITWALL
          </h1>
        </div>
        <div className="pw-login-board">
          <PasscodeInput value={passcode} onChange={setPasscode} error={error} attempt={attempt} help="Sign in to watch and stop the bot." />
          <button type="submit" className="pw-btn pw-btn-primary" disabled={busy}>
            {busy ? 'Checking…' : 'Sign in'}
          </button>
        </div>
      </form>
    </div>
  );
}

function App() {
  const [session, setSession] = useState<'checking' | 'in' | 'out'>(DEMO ? 'in' : 'checking');
  useEffect(() => {
    if (DEMO) return;
    fetch('/api/session', { signal: AbortSignal.timeout(5_000) }).then(
      (r) => setSession(r.ok ? 'in' : 'out'),
      () => setSession('out'),
    );
  }, []);
  if (session === 'checking')
    return (
      <div className="pw-login">
        <ModeStrip mode={null} />
        <p className="pw-login-board pw-label pw-muted">Checking your session…</p>
      </div>
    );
  if (session === 'out') return <SignIn onSignedIn={() => setSession('in')} />;
  return <Shell onSignedOut={() => setSession('out')} />;
}

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
