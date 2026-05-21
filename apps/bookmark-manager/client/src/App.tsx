import { useEffect, useState } from 'react';
import { api, UnauthorizedError } from './api';
import Login from './pages/Login';
import BookmarkManager from './components/BookmarkManager';

type AuthStatus = 'unknown' | 'unauthenticated' | 'authenticated';

export default function App() {
  const [authStatus, setAuthStatus] = useState<AuthStatus>('unknown');

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
    return <Login onLoggedIn={() => setAuthStatus('authenticated')} />;
  }

  return (
    <BookmarkManager onUnauthorized={() => setAuthStatus('unauthenticated')} />
  );
}

export function isUnauthorized(err: unknown): err is UnauthorizedError {
  return err instanceof UnauthorizedError;
}
