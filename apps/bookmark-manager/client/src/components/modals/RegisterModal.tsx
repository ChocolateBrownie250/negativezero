import { useState, type FormEvent } from 'react';
import { Copy, Check } from 'lucide-react';
import {
  startRegistration,
  browserSupportsWebAuthn,
} from '@simplewebauthn/browser';
import Modal from './Modal';
import { api } from '../../api';
import {
  COLORS,
  RING_STRONG,
  LABEL_PRIMARY,
  LABEL_SECONDARY,
} from '../../lib/colors';

interface Props {
  mode: 'first' | 'reset';
  onClose: () => void;
  onDone: () => void;
}

type Stage = 'enter-code' | 'show-backup';

function deviceLabel(): string {
  if (typeof navigator === 'undefined') return 'Browser';
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return 'iOS device';
  if (/Macintosh/.test(ua)) return 'Mac';
  if (/Android/.test(ua)) return 'Android device';
  if (/Windows/.test(ua)) return 'Windows';
  return 'Browser';
}

export default function RegisterModal({ mode, onClose, onDone }: Props) {
  const [stage, setStage] = useState<Stage>('enter-code');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [backupCode, setBackupCode] = useState<string | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const supported = browserSupportsWebAuthn();

  const title = mode === 'first' ? 'First-time setup' : 'Reset passkey';
  const codeLabel = mode === 'first' ? 'Setup code' : 'Backup code';
  const codeHint =
    mode === 'first'
      ? 'Enter the setup code from your server admin (set as SETUP_CODE on the box).'
      : 'Enter the 16-character backup code you saved when you first set up.';

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!code.trim() || submitting) return;
    if (!supported) {
      setError('This browser does not support passkeys.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const options = await api.passkey.registerOptions(
        mode === 'first' ? { setupCode: code.trim() } : { backupCode: code.trim() },
      );
      const attestation = await startRegistration({
        optionsJSON: options as never,
      });
      const result = await api.passkey.registerVerify(attestation, deviceLabel());
      if (result.backupCode) {
        setBackupCode(result.backupCode);
        setStage('show-backup');
        setSubmitting(false);
      } else {
        // unlikely path: server didn't return a backup (shouldn't happen for first/reset)
        onDone();
      }
    } catch (err: unknown) {
      const status = (err as { status?: number }).status;
      const name = (err as { name?: string }).name;
      if (status === 401) {
        setError(
          mode === 'first' ? 'Setup code is wrong.' : 'Backup code is wrong.',
        );
      } else if (status === 429) {
        setError('Too many attempts. Try again later.');
      } else if (name === 'NotAllowedError') {
        setError('Passkey ceremony cancelled or unavailable.');
      } else {
        setError('Could not enroll. Try again.');
      }
      setSubmitting(false);
    }
  }

  async function copyCode() {
    if (!backupCode) return;
    try {
      await navigator.clipboard.writeText(backupCode);
    } catch {
      // best effort
    }
  }

  if (stage === 'show-backup' && backupCode) {
    return (
      <Modal title="Save your backup code" onClose={() => undefined}>
        <p className="text-[13px] mb-3" style={{ color: LABEL_SECONDARY }}>
          Write this down somewhere safe. If you ever lose your passkey, this is
          the only way back in. It will not be shown again.
        </p>
        <div
          className="rounded-xl px-4 py-3 mb-3 flex items-center gap-3"
          style={{
            background: COLORS.surface,
            boxShadow: `inset 0 0 0 1px ${RING_STRONG}`,
          }}
        >
          <div
            className="flex-1 font-mono text-[15px] tracking-wider select-all"
            style={{ color: LABEL_PRIMARY }}
          >
            {backupCode}
          </div>
          <button
            type="button"
            onClick={copyCode}
            className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{ background: COLORS.raised, color: LABEL_PRIMARY }}
            aria-label="Copy"
          >
            <Copy size={14} />
          </button>
        </div>
        <label className="flex items-center gap-3 mb-3 py-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
            className="sr-only"
          />
          <span
            className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 transition-colors"
            style={{
              background: acknowledged ? COLORS.blue : COLORS.surface,
              boxShadow: acknowledged
                ? 'inset 0 1px 0 rgba(255,255,255,0.20)'
                : `inset 0 0 0 1.5px ${RING_STRONG}`,
            }}
          >
            {acknowledged && <Check size={16} strokeWidth={3} color="white" />}
          </span>
          <span
            className="text-[14px]"
            style={{ color: acknowledged ? LABEL_PRIMARY : LABEL_SECONDARY }}
          >
            I have saved this backup code
          </span>
        </label>
        <button
          type="button"
          onClick={onDone}
          disabled={!acknowledged}
          className="w-full rounded-xl py-3 text-white font-semibold disabled:opacity-50"
          style={{
            background: COLORS.blue,
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.20)',
          }}
        >
          Continue
        </button>
      </Modal>
    );
  }

  return (
    <Modal title={title} onClose={onClose}>
      <form onSubmit={onSubmit}>
        <label
          className="block text-[13px] font-medium mb-1"
          style={{ color: LABEL_SECONDARY }}
        >
          {codeLabel}
        </label>
        <input
          autoFocus
          type="text"
          autoCapitalize="characters"
          autoComplete="one-time-code"
          spellCheck={false}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder={mode === 'first' ? 'Setup code' : 'XXXX-XXXX-XXXX-XXXX'}
          className="w-full rounded-xl px-4 py-3 mb-2 font-mono"
          style={{
            background: COLORS.surface,
            boxShadow: `inset 0 0 0 1px ${RING_STRONG}, inset 0 1px 0 rgba(0,0,0,0.20)`,
          }}
        />
        <p className="text-[12px] mb-3" style={{ color: LABEL_SECONDARY }}>
          {codeHint}
        </p>
        {error && (
          <div className="text-[13px] mb-3" style={{ color: COLORS.red }}>
            {error}
          </div>
        )}
        <div className="grid grid-cols-2 gap-3 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl py-3 text-white font-medium"
            style={{
              background: COLORS.surface,
              boxShadow: `inset 0 0 0 1px ${RING_STRONG}`,
            }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!code.trim() || submitting || !supported}
            className="rounded-xl py-3 text-white font-semibold disabled:opacity-50"
            style={{
              background: COLORS.blue,
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.20)',
            }}
          >
            {submitting
              ? 'Verifying...'
              : mode === 'first'
                ? 'Register passkey'
                : 'Reset passkey'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
