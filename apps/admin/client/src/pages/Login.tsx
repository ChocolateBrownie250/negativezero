import { useEffect, useState } from 'react';
import { Shield, KeyRound, UserPlus, RotateCcw } from 'lucide-react';
import {
  startAuthentication,
  browserSupportsWebAuthn,
} from '@simplewebauthn/browser';
import { api } from '../api';
import { COLORS, RING_STRONG, LABEL_SECONDARY } from '../lib/colors';
import RegisterModal from '../components/modals/RegisterModal';

interface Props {
  onLoggedIn: () => void;
}

// This page is the shared SSO hub: other services bounce unauthenticated users
// here with ?return=/services/<svc>/, so the copy must not imply it is an
// "admin only" gate (any registered account may sign in; what they can then USE
// is decided per-service). Map the destination slug to a friendly name so the
// user knows which service they are signing in to continue to.
const SERVICE_NAMES: Record<string, string> = {
  amethyst: 'Amethyst',
  tts: 'Amethyst', // legacy path, kept while old /services/tts/ links redirect
  'bookmark-manager': 'Bookmark Manager',
  'video-downloader': 'Video Downloader',
  redirector: 'Redirector',
  timezones: 'Timezones',
  admin: 'Admin',
};

// One short, lowercase line of what each service is — shown under the service
// name so the card reads "<Service>" / "<what it does>" everywhere, instead of
// the old "negativezero" wordmark + "continue to X" sentence.
const SERVICE_TAGLINES: Record<string, string> = {
  amethyst: 'speech to text · transcriber',
  tts: 'speech to text · transcriber',
  'bookmark-manager': 'save & organize links',
  'video-downloader': 'download & save videos',
  redirector: 'short links & redirects',
  timezones: 'meeting times across zones',
  admin: 'accounts & access',
};

// Only allow same-origin absolute paths under /services/ as a post-login
// redirect target — reject scheme/host, protocol-relative (//host) and
// backslash tricks so ?return= can't be turned into an open redirect.
function safeReturn(raw: string | null): string | null {
  if (!raw) return null;
  if (!raw.startsWith('/services/') || raw.startsWith('/services//')) return null;
  if (raw.includes('://') || raw.includes('\\')) return null;
  return raw;
}

function returnService(
  raw: string | null,
): { name: string; tagline: string | null } | null {
  const safe = safeReturn(raw);
  if (!safe) return null;
  const slug = safe.match(/^\/services\/([^/]+)/)?.[1];
  if (!slug) return null;
  return { name: SERVICE_NAMES[slug] ?? slug, tagline: SERVICE_TAGLINES[slug] ?? null };
}

export default function Login({ onLoggedIn }: Props) {
  const [hasPasskey, setHasPasskey] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [modal, setModal] = useState<'first' | 'reset' | null>(null);
  const supported = typeof window !== 'undefined' && browserSupportsWebAuthn();
  const returnParam =
    typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('return')
      : null;
  const service = returnService(returnParam);
  // Big title is always the *service* name (falling back to the hub wordmark
  // when opened directly with no ?return), with a one-line description below.
  const title = service?.name ?? 'negativezero';
  const tagline = service?.tagline ?? 'one account · every service';

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
      const returnValue = safeReturn(returnParam);
      if (returnValue) {
        // replace() not assign(): the SSO bounce shouldn't leave this login
        // in history, or pressing Back from the destination service lands back
        // on it (which re-bounces) or drops out of the app.
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
      <div className="min-h-screen flex items-center justify-center text-white/40 text-sm">
        Loading...
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
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
          {title}
        </h1>
        <p
          className="text-[13px] text-center mb-5"
          style={{ color: LABEL_SECONDARY }}
        >
          {tagline}
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

        {/* Secondary actions as their own buttons (not faint text links) so it's
            obvious they're tappable and distinct from the primary passkey CTA.
            Invite-code entry: pre-bootstrap the prominent "Register for the first
            time" button already opens this path, so these only show once an owner
            passkey exists — an invited friend with a setup code can still enroll,
            and a backup code can recover a lost passkey. */}
        {hasPasskey && (
          <div
            className="mt-4 pt-4 grid grid-cols-2 gap-2"
            style={{ borderTop: `1px solid ${RING_STRONG}` }}
          >
            <button
              type="button"
              onClick={() => setModal('first')}
              disabled={!supported}
              className="rounded-xl py-2.5 text-[13px] font-medium text-white disabled:opacity-50 flex items-center justify-center gap-1.5"
              style={{
                background: COLORS.surface,
                boxShadow: `inset 0 0 0 1px ${RING_STRONG}`,
              }}
            >
              <UserPlus size={15} />
              Register
            </button>
            <button
              type="button"
              onClick={() => setModal('reset')}
              className="rounded-xl py-2.5 text-[13px] font-medium text-white flex items-center justify-center gap-1.5"
              style={{
                background: COLORS.surface,
                boxShadow: `inset 0 0 0 1px ${RING_STRONG}`,
              }}
            >
              <RotateCcw size={15} />
              Reset
            </button>
          </div>
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
