import { Link, usePath } from './lib/router';
import { useApp } from './lib/store';
import { TvPage } from './tv/TvPage';
import { RemotePage } from './remote/RemotePage';
import { HistoryPage } from './history/HistoryPage';
import { SettingsPage } from './settings/SettingsPage';
import { BodyPage } from './body/BodyPage';

function Landing() {
  const { mode } = useApp();
  return (
    <div className="page stack">
      <h1>Dumbbell Coach</h1>
      <p className="muted">Open the TV page on the big screen and the remote on your phone.</p>
      <div className="stack">
        <Link to="/tv" className="btn big">
          TV screen
        </Link>
        <Link to="/remote" className="btn big primary">
          Phone remote
        </Link>
        <Link to="/history" className="btn">
          History
        </Link>
        <Link to="/body" className="btn">
          Body
        </Link>
        <Link to="/settings" className="btn">
          Settings
        </Link>
      </div>
      <p className="faint" style={{ marginTop: 24 }}>
        {mode === 'local'
          ? 'Local mode: no Firebase configured. The TV and remote must be tabs in this same browser.'
          : 'Connected to Firebase.'}
      </p>
    </div>
  );
}

export function App() {
  const path = usePath();
  if (path.startsWith('/tv')) return <TvPage />;
  if (path.startsWith('/remote')) return <RemotePage />;
  if (path.startsWith('/history')) return <HistoryPage />;
  if (path.startsWith('/body')) return <BodyPage />;
  if (path.startsWith('/settings')) return <SettingsPage />;
  return <Landing />;
}
