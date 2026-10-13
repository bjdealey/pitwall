import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import '@fontsource/ibm-plex-mono/600.css';
import './tokens.css';
import './pitwall.css';
import { Activity, ArrowLeftRight, Briefcase, House, Layers, OctagonX } from 'lucide-react';
import { StrictMode, useCallback, useEffect, useState, type FormEvent } from 'react';
import { createRoot } from 'react-dom/client';
import { MarketChip, ModeBanner, PasscodeInput, StaleChip } from './components.tsx';
import { duration } from '../shared/format.ts';
import { freshness, postJson, useNow, useSnapshot, type Feed } from './data.ts';
import { Events, Orders, Overview, PauseAllSheet, Positions, Strategies } from './screens.tsx';

const ROUTES = [
  { hash: '#/', label: 'Overview', short: 'Overview', Icon: House, Screen: Overview },
  { hash: '#/positions', label: 'Positions', short: 'Positions', Icon: Briefcase, Screen: Positions },
  { hash: '#/orders', label: 'Orders & fills', short: 'Orders', Icon: ArrowLeftRight, Screen: Orders },
  { hash: '#/strategies', label: 'Strategies', short: 'Strategies', Icon: Layers, Screen: Strategies },
  { hash: '#/events', label: 'Events', short: 'Events', Icon: Activity, Screen: Events },
] as const;

function useRoute() {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    const onChange = () => setHash(location.hash);
    addEventListener('hashchange', onChange);
    return () => removeEventListener('hashchange', onChange);
  }, []);
  return ROUTES.find((r) => r.hash === hash) ?? ROUTES[0];
}

function RailStatus({ feed, stale, heartbeatAgeMs }: { feed: Feed | null; stale: boolean; heartbeatAgeMs: number }) {
  if (!feed) return <p className="pw-figure-sm pw-muted">Connecting…</p>;
  const broker = feed.snapshot.health.brokerConnected;
  return (
    <dl className="pw-rail-status pw-figure-sm">
      <div>
        <dt>
          <span className={`pw-dot ${stale ? 'pw-dot-warn' : 'pw-dot-pos'}`} />
          Engine
        </dt>
        <dd>{Number.isFinite(heartbeatAgeMs) ? `${duration(heartbeatAgeMs / 1000)} ago` : 'no heartbeat'}</dd>
      </div>
      <div>
        <dt>
          <span className={`pw-dot ${broker ? 'pw-dot-pos' : 'pw-dot-neg'}`} />
          Broker
        </dt>
        <dd>{broker ? 'connected' : 'down'}</dd>
      </div>
    </dl>
  );
}

function Shell({ onSignedOut }: { onSignedOut: () => void }) {
  const feed = useSnapshot(onSignedOut);
  const now = useNow();
  const route = useRoute();
  const [pausing, setPausing] = useState(false);
  const openPauseAll = useCallback(() => setPausing(true), []);
  const closePauseAll = useCallback(() => setPausing(false), []);
  const { stale, heartbeatAgeMs } = feed ? freshness(feed, now) : { stale: true, heartbeatAgeMs: Infinity };
  useEffect(() => {
    document.title = `${route.label} · Pitwall`;
  }, [route.label]);

  return (
    <div className="pw-app">
      <ModeBanner mode={feed?.snapshot.mode ?? null} />
      <aside className="pw-rail">
        <div className="pw-rail-brand">
          <span className="pw-wordmark">PITWALL</span>
        </div>
        <nav className="pw-rail-nav" aria-label="Screens">
          {ROUTES.map(({ hash, label, Icon }) => (
            <a key={hash} href={hash} className="pw-rail-item pw-label" aria-current={hash === route.hash ? 'page' : undefined}>
              <Icon className="pw-icon" aria-hidden />
              {label}
            </a>
          ))}
        </nav>
        <div className="pw-rail-foot">
          <RailStatus feed={feed} stale={stale} heartbeatAgeMs={heartbeatAgeMs} />
        </div>
      </aside>
      <header className="pw-topbar">
        <h1 className="pw-title pw-topbar-title">{route.label}</h1>
        {feed && <MarketChip market={feed.snapshot.market} now={now} />}
        {feed && stale && <StaleChip ageMs={heartbeatAgeMs} />}
        <button type="button" className="pw-btn pw-btn-stop pw-btn-compact" onClick={openPauseAll}>
          <OctagonX className="pw-icon" aria-hidden />
          <span>Stop</span>
        </button>
      </header>
      <main className="pw-content">
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
          <a key={hash} href={hash} className="pw-tab pw-figure-sm" aria-current={hash === route.hash ? 'page' : undefined}>
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
      <ModeBanner mode={null} />
      <form className="pw-login-card" onSubmit={submit}>
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
  if (session === 'checking') return <ModeBanner mode={null} />;
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
