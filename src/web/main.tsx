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
import { freshness, postJson, useNow, useSnapshot } from './data.ts';
import { Events, Orders, Overview, PauseAllSheet, Positions, Strategies } from './screens.tsx';

const ROUTES = [
  { hash: '#/', label: 'Overview', Icon: House, Screen: Overview },
  { hash: '#/positions', label: 'Positions', Icon: Briefcase, Screen: Positions },
  { hash: '#/orders', label: 'Orders & fills', Icon: ArrowLeftRight, Screen: Orders },
  { hash: '#/strategies', label: 'Strategies', Icon: Layers, Screen: Strategies },
  { hash: '#/events', label: 'Events', Icon: Activity, Screen: Events },
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

function Shell({ onSignedOut }: { onSignedOut: () => void }) {
  const feed = useSnapshot(onSignedOut);
  const now = useNow();
  const route = useRoute();
  const [pausing, setPausing] = useState(false);
  const openPauseAll = useCallback(() => setPausing(true), []);
  const closePauseAll = useCallback(() => setPausing(false), []);
  const { stale, heartbeatAgeMs } = feed ? freshness(feed, now) : { stale: true, heartbeatAgeMs: Infinity };

  return (
    <div className="pw-app">
      <ModeBanner mode={feed?.snapshot.mode ?? null} />
      <header className="pw-header">
        <span className="pw-header-mark pw-wordmark">PITWALL</span>
        {feed && <MarketChip market={feed.snapshot.market} now={now} />}
        {feed && stale && <StaleChip ageMs={heartbeatAgeMs} />}
        <button type="button" className="pw-btn pw-btn-stop pw-btn-compact" onClick={openPauseAll}>
          <OctagonX className="pw-icon" aria-hidden />
          <span>Stop</span>
        </button>
      </header>
      <nav className="pw-rail" aria-label="Screens">
        {ROUTES.map(({ hash, label, Icon }) => (
          <a key={hash} href={hash} className="pw-rail-item pw-label" aria-current={hash === route.hash ? 'page' : undefined}>
            <Icon className="pw-icon" aria-hidden />
            {label}
          </a>
        ))}
      </nav>
      <main className="pw-content">
        <div className="pw-main">
          {feed ? (
            <route.Screen snapshot={feed.snapshot} stale={stale} heartbeatAgeMs={heartbeatAgeMs} openPauseAll={openPauseAll} />
          ) : (
            <p className="pw-body pw-muted">Waiting for the first engine heartbeat.</p>
          )}
        </div>
      </main>
      {pausing && <PauseAllSheet onClose={closePauseAll} />}
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
      <form className="pw-card pw-login-card" onSubmit={submit}>
        <span className="pw-wordmark">PITWALL</span>
        <PasscodeInput value={passcode} onChange={setPasscode} error={error} help="Sign in to watch and stop the bot." />
        <button type="submit" className="pw-btn" disabled={busy}>
          Sign in
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
