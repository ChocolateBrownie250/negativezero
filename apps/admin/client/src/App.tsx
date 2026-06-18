import { useEffect, useState } from 'react';
import { api, UnauthorizedError } from './api';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import NoAdmin from './pages/NoAdmin';

type AuthStatus = 'unknown' | 'unauthenticated' | 'no-admin' | 'authenticated';

export default function App() {
  const [authStatus, setAuthStatus] = useState<AuthStatus>('unknown');

  // Re-evaluate auth + admin state from the server. Used on mount and after a
  // successful sign-in/enroll so the canAdmin gate stays authoritative — e.g. a
  // friend who enrolls with a setup code is authenticated but not an admin, and
  // must land on the NoAdmin screen rather than the Dashboard.
  function refresh() {
    return api
      .me()
      .then((r) => {
        if (!r.authenticated) setAuthStatus('unauthenticated');
        else setAuthStatus(r.canAdmin ? 'authenticated' : 'no-admin');
      })
      .catch(() => {
        setAuthStatus('unauthenticated');
      });
  }

  useEffect(() => {
    let cancelled = false;
    api
      .me()
      .then((r) => {
        if (cancelled) return;
        if (!r.authenticated) setAuthStatus('unauthenticated');
        else setAuthStatus(r.canAdmin ? 'authenticated' : 'no-admin');
      })
      .catch(() => {
        if (cancelled) return;
        setAuthStatus('unauthenticated');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (authStatus === 'unknown') {
    return (
      <div className="min-h-screen flex items-center justify-center text-white/40 text-sm">
        Loading...
      </div>
    );
  }

  if (authStatus === 'unauthenticated') {
    return <Login onLoggedIn={refresh} />;
  }

  if (authStatus === 'no-admin') {
    return <NoAdmin onSignedOut={() => setAuthStatus('unauthenticated')} />;
  }

  return (
    <Dashboard onUnauthorized={() => setAuthStatus('unauthenticated')} />
  );
}

export function isUnauthorized(err: unknown): err is UnauthorizedError {
  return err instanceof UnauthorizedError;
}
