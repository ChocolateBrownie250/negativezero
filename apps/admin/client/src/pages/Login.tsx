import { useEffect, useState } from 'react';
import { Shield, KeyRound } from 'lucide-react';
import {
  startAuthentication,
  browserSupportsWebAuthn,
} from '@simplewebauthn/browser';
import { api } from '../api';
import {
  COLORS,
  RING_STRONG,
  LABEL_SECONDARY,
  LABEL_TERTIARY,
} from '../lib/colors';
import RegisterModal from '../components/modals/RegisterModal';

interface Props {
  onLoggedIn: () => void;
}

export default function Login({ onLoggedIn }: Props) {
  const [hasPasskey, setHasPasskey] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [modal, setModal] = useState<'first' | 'reset' | null>(null);
  const supported = typeof window !== 'undefined' && browserSupportsWebAuthn();

  useEffect(() => {
    let cancelled = false;
    api
      .me()
      .then((r) => {
        if (cancelled) return;
        setHasPasskey(r.hasPasskey);
      })
      .catch(() => {
        if (cancelled) return;
        setHasPasskey(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function onPasskey() {
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const options = await api.passkey.loginOptions();
      const assertion = await startAuthentication({ optionsJSON: options as never });
      await api.passkey.loginVerify(assertion);
      // Cross-service SSO bounce: if another service sent us here with a
      // ?return=/services/... path, return the user there now that the shared
      // nz_session cookie has been set. Guard to same-origin /services/ paths.
      const returnValue = new URLSearchParams(window.location.search).get('return');
      if (returnValue && returnValue.startsWith('/services/')) {
        // replace() not assign(): the SSO bounce shouldn't leave the admin
        // login in history, or pressing Back from the destination service
        // lands back on this login (which re-bounces) or drops out of the app.
        window.location.replace(returnValue);
        return;
      }
      onLoggedIn();
    } catch (err: unknown) {
      const status = (err as { status?: number }).status;
      const name = (err as { name?: string }).name;
      if (status === 429) setError('Too many attempts. Try again later.');
      else if (name === 'NotAllowedError') setError('Passkey cancelled or unavailable.');
      else setError('Passkey sign-in failed.');
      setSubmitting(false);
    }
  }

  if (hasPasskey === null) {
    return (
      <div
        className="min-h-screen flex items-center justify-center text-white/40 text-sm"
        style={{ background: COLORS.bg }}
      >
        Loading...
      </div>
    );
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: COLORS.bg }}
    >
      <div
        className="w-full max-w-sm rounded-2xl p-6"
        style={{
          background: COLORS.card,
          boxShadow: `0 0 0 1px ${RING_STRONG}, 0 8px 28px rgba(0,0,0,0.55)`,
        }}
      >
        <div className="flex items-center justify-center mb-4">
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center"
            style={{ background: COLORS.surface }}
          >
            <Shield size={22} color="#ffffff" />
          </div>
        </div>
        <h1 className="text-[22px] font-semibold text-white text-center mb-1">
          Admin
        </h1>
        <p
          className="text-[13px] text-center mb-5"
          style={{ color: LABEL_SECONDARY }}
        >
          {hasPasskey
            ? 'Sign in with your passkey'
            : 'No admin passkey registered yet'}
        </p>

        {!supported && (
          <div
            className="text-[13px] mb-4 text-center"
            style={{ color: COLORS.red }}
          >
            This browser does not support passkeys.
          </div>
        )}

        {hasPasskey && (
          <button
            type="button"
            onClick={onPasskey}
            disabled={submitting || !supported}
            className="w-full rounded-xl py-3 text-white font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
            style={{
              background: COLORS.blue,
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.20)',
            }}
          >
            <KeyRound size={18} />
            {submitting ? 'Verifying...' : 'Sign in with passkey'}
          </button>
        )}

        {!hasPasskey && (
          <button
            type="button"
            onClick={() => setModal('first')}
            disabled={!supported}
            className="w-full rounded-xl py-3 text-white font-semibold disabled:opacity-50"
            style={{
              background: COLORS.blue,
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.20)',
            }}
          >
            Register for the first time
          </button>
        )}

        {error && (
          <div
            className="text-[13px] mt-3 text-center"
            style={{ color: COLORS.red }}
            role="alert"
          >
            {error}
          </div>
        )}

        {/* Invite-code entry. Pre-bootstrap (no passkey) the prominent
            "Register for the first time" button above already opens the
            setup-code path; this link adds the same entry once an owner
            passkey exists, so an invited friend with a setup code can still
            enroll. */}
        {hasPasskey && (
          <button
            type="button"
            onClick={() => setModal('first')}
            disabled={!supported}
            className="block mx-auto mt-4 text-[13px] disabled:opacity-50"
            style={{ color: LABEL_TERTIARY, background: 'transparent' }}
          >
            Have an invite code? Register
          </button>
        )}

        {hasPasskey && (
          <button
            type="button"
            onClick={() => setModal('reset')}
            className="block mx-auto mt-3 text-[13px]"
            style={{ color: LABEL_TERTIARY, background: 'transparent' }}
          >
            Lost your passkey? Reset with backup code
          </button>
        )}
      </div>

      {modal && (
        <RegisterModal
          mode={modal}
          onClose={() => setModal(null)}
          onDone={() => {
            setModal(null);
            onLoggedIn();
          }}
        />
      )}
    </div>
  );
}
