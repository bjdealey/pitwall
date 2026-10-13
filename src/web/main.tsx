import '@fontsource-variable/archivo/wdth.css';
import './tokens.css';
import './pitwall.css';
import { Activity, ArrowLeftRight, Briefcase, Gauge, Layers, OctagonX } from 'lucide-react';
import { StrictMode, useCallback, useEffect, useState, type FormEvent } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { MarketChip, ModeStrip, PasscodeInput, TrackBand, trackStatus } from './components.tsx';
import { freshness, postJson, useNow, useSnapshot } from './data.ts';
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
      document.startViewTransition(update);
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
  const [pausing, setPausing] = useState(false);
  const openPauseAll = useCallback(() => setPausing(true), []);
  const closePauseAll = useCallback(() => setPausing(false), []);
  const { stale, heartbeatAgeMs } = feed ? freshness(feed, now) : { stale: true, heartbeatAgeMs: Infinity };
  const status = trackStatus(feed ? { strategies: feed.snapshot.strategies, market: feed.snapshot.market, stale, heartbeatAgeMs } : null);
  useEffect(() => {
    document.title = `${route.label} · Pitwall`;
  }, [route.label]);

  return (
    <div className="pw-app">
      <ModeStrip mode={feed?.snapshot.mode ?? null} />
      <TrackBand status={status} />
      <header className="pw-gantry">
        <span className="pw-wordmark">PITWALL</span>
        <nav className="pw-nav" aria-label="Screens">
          {ROUTES.map(({ hash, label }) => (
            <a key={hash} href={hash} className="pw-nav-item pw-timing" aria-current={hash === route.hash ? 'page' : undefined}>
              {label}
              {hash === route.hash && <span className="pw-nav-pill" aria-hidden />}
            </a>
          ))}
        </nav>
        {feed && <MarketChip market={feed.snapshot.market} now={now} />}
        <button type="button" className="pw-btn pw-btn-stop pw-btn-compact" onClick={openPauseAll}>
          <OctagonX className="pw-icon" aria-hidden />
          <span>Stop</span>
        </button>
      </header>
      <main className="pw-content">
        <h1 className="pw-sr">{route.label}</h1>
        <div className="pw-main">
          {feed ? (
            <route.Screen snapshot={feed.snapshot} stale={stale} heartbeatAgeMs={heartbeatAgeMs} openPauseAll={openPauseAll} />
          ) : (
            <p className="pw-waiting pw-label pw-muted">Waiting for the first engine heartbeat.</p>
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
      {pausing && <PauseAllSheet snapshot={feed?.snapshot ?? null} onClose={closePauseAll} />}
    </div>
  );
}

function SignIn({ onSignedIn }: { onSignedIn: () => void }) {
  const [passcode, setPasscode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!passcode) return setError('Enter the passcode.');
    setBusy(true);
    const result = await postJson('/api/login', { passcode });
    setBusy(false);
    if (result.ok) onSignedIn();
    else setError(result.error);
  };
  return (
    <div className="pw-login">
      <ModeStrip mode={null} />
      <form className="pw-login-board" onSubmit={submit}>
        <span className="pw-wordmark">PITWALL</span>
        <PasscodeInput value={passcode} onChange={setPasscode} error={error} help="Sign in to watch and stop the bot." />
        <button type="submit" className="pw-btn pw-btn-primary" disabled={busy}>
          {busy ? 'Checking…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}

function App() {
  const [session, setSession] = useState<'checking' | 'in' | 'out'>('checking');
  useEffect(() => {
    fetch('/api/session').then(
      (r) => setSession(r.ok ? 'in' : 'out'),
      () => setSession('out'),
    );
  }, []);
  const signedOut = useCallback(() => setSession('out'), []);
  if (session === 'checking') return <ModeStrip mode={null} />;
  if (session === 'out') return <SignIn onSignedIn={() => setSession('in')} />;
  return <Shell onSignedOut={signedOut} />;
}

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
