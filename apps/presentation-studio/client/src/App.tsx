import { useEffect, useState } from 'react';
import { api, UnauthorizedError } from './api';
import { applyPwaUpdate, type PwaUpdateDetail } from './lib/pwa';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';

type AuthStatus = 'unknown' | 'unauthenticated' | 'authenticated';

export default function App() {
  const [authStatus, setAuthStatus] = useState<AuthStatus>('unknown');
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  const [updateRegistration, setUpdateRegistration] = useState<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .me()
      .then((r) => {
        if (cancelled) return;
        setAuthStatus(r.authenticated ? 'authenticated' : 'unauthenticated');
      })
      .catch(() => {
        if (cancelled) return;
        setAuthStatus(navigator.onLine ? 'unauthenticated' : 'authenticated');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function syncOnlineStatus() {
      setOnline(navigator.onLine);
    }
    function onPwaUpdate(event: Event) {
      setUpdateRegistration((event as CustomEvent<PwaUpdateDetail>).detail.registration);
    }

    window.addEventListener('online', syncOnlineStatus);
    window.addEventListener('offline', syncOnlineStatus);
    window.addEventListener('citrine:pwa-update', onPwaUpdate);
    return () => {
      window.removeEventListener('online', syncOnlineStatus);
      window.removeEventListener('offline', syncOnlineStatus);
      window.removeEventListener('citrine:pwa-update', onPwaUpdate);
    };
  }, []);

  const statusLayer = (
    <AppStatusLayer
      isOffline={!online}
      updateRegistration={updateRegistration}
      onUpdate={() => {
        if (updateRegistration) applyPwaUpdate(updateRegistration);
      }}
    />
  );

  if (authStatus === 'unknown') {
    return (
      <>
        {statusLayer}
        <div className="min-h-screen flex items-center justify-center text-white/40 text-sm">
          Loading...
        </div>
      </>
    );
  }

  if (authStatus === 'unauthenticated') {
    return (
      <>
        {statusLayer}
        <Login isOffline={!online} onLoggedIn={() => setAuthStatus('authenticated')} />
      </>
    );
  }

  return (
    <>
      {statusLayer}
      <Dashboard isOffline={!online} onUnauthorized={() => setAuthStatus('unauthenticated')} />
    </>
  );
}

export function isUnauthorized(err: unknown): err is UnauthorizedError {
  return err instanceof UnauthorizedError;
}

function AppStatusLayer({
  isOffline,
  updateRegistration,
  onUpdate,
}: {
  isOffline: boolean;
  updateRegistration: ServiceWorkerRegistration | null;
  onUpdate: () => void;
}) {
  if (!isOffline && !updateRegistration) return null;

  return (
    <div className="app-status-stack" aria-live="polite">
      {isOffline && (
        <div className="app-status-banner">
          <span>Offline. Local Citrine work stays saved on this device; server actions wait for connection.</span>
        </div>
      )}
      {updateRegistration && (
        <div className="app-status-banner app-status-banner-update">
          <span>New Citrine version is ready.</span>
          <button type="button" onClick={onUpdate}>
            Reload
          </button>
        </div>
      )}
    </div>
  );
}
