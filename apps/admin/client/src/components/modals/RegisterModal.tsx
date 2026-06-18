import { useState } from 'react';
import { startRegistration } from '@simplewebauthn/browser';
import { api } from '../../api';
import { COLORS, LABEL_SECONDARY, LABEL_TERTIARY } from '../../lib/colors';
import Modal from './Modal';

type Mode = 'first' | 'reset';

interface Props {
  mode: Mode;
  onClose: () => void;
  onDone: () => void;
}

export default function RegisterModal({ mode, onClose, onDone }: Props) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [deviceName, setDeviceName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [backupCode, setBackupCode] = useState<string | null>(null);

  async function onRegister() {
    if (!code.trim() || submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const trimmedName = name.trim() || undefined;
      const args =
        mode === 'first'
          ? { setupCode: code.trim(), name: trimmedName }
          : { backupCode: code.trim(), name: trimmedName };
      const options = await api.passkey.registerOptions(args);
      const att = await startRegistration({ optionsJSON: options as never });
      const result = await api.passkey.registerVerify(
        att,
        deviceName.trim() || undefined,
      );
      if (result.backupCode) {
        setBackupCode(result.backupCode);
      } else {
        onDone();
      }
    } catch (err: unknown) {
      const name = (err as { name?: string }).name;
      const status = (err as { status?: number }).status;
      if (status === 401) setError('Code rejected.');
      else if (status === 429) setError('Too many attempts. Try again later.');
      else if (name === 'NotAllowedError') setError('Passkey cancelled or unavailable.');
      else setError('Registration failed.');
    } finally {
      setSubmitting(false);
    }
  }

  if (backupCode) {
    return (
      <Modal
        title="Save your backup code"
        onClose={onDone}
        footer={
          <button
            type="button"
            onClick={onDone}
            className="w-full rounded-xl py-3 text-white font-semibold"
            style={{ background: COLORS.blue }}
          >
            I've saved it
          </button>
        }
      >
        <p
          className="text-[13px] mb-3"
          style={{ color: LABEL_SECONDARY }}
        >
          Store this somewhere safe (1Password). It's the only way to register
          a new passkey if you lose access to all current ones. Shown once.
        </p>
        <div
          className="rounded-xl p-3 font-mono text-[15px] text-center select-all"
          style={{ background: COLORS.surface, color: COLORS.ink }}
        >
          {backupCode}
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      title={mode === 'first' ? 'Register first passkey' : 'Reset with backup code'}
      onClose={onClose}
      footer={
        <button
          type="button"
          onClick={onRegister}
          disabled={submitting || !code.trim()}
          className="w-full rounded-xl py-3 text-white font-semibold disabled:opacity-50"
          style={{ background: COLORS.blue }}
        >
          {submitting ? 'Working…' : 'Continue'}
        </button>
      }
    >
      <label className="block text-[13px] mb-1" style={{ color: LABEL_SECONDARY }}>
        {mode === 'first' ? 'Setup code' : 'Backup code'}
      </label>
      <input
        type="text"
        autoFocus
        spellCheck={false}
        autoCapitalize="characters"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        className="w-full rounded-xl px-3 py-2 mb-4 font-mono"
        style={{
          background: COLORS.surface,
          color: COLORS.ink,
          border: '1px solid rgba(255,255,255,0.08)',
        }}
      />
      <label className="block text-[13px] mb-1" style={{ color: LABEL_SECONDARY }}>
        Your name (optional)
      </label>
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g. Igor"
        className="w-full rounded-xl px-3 py-2 mb-4"
        style={{
          background: COLORS.surface,
          color: COLORS.ink,
          border: '1px solid rgba(255,255,255,0.08)',
        }}
      />
      <label className="block text-[13px] mb-1" style={{ color: LABEL_SECONDARY }}>
        Device name (optional)
      </label>
      <input
        type="text"
        value={deviceName}
        onChange={(e) => setDeviceName(e.target.value)}
        placeholder="e.g. iPhone 15"
        className="w-full rounded-xl px-3 py-2"
        style={{
          background: COLORS.surface,
          color: COLORS.ink,
          border: '1px solid rgba(255,255,255,0.08)',
        }}
      />
      {error && (
        <div
          className="text-[13px] mt-3 text-center"
          style={{ color: COLORS.red }}
          role="alert"
        >
          {error}
        </div>
      )}
      <button
        type="button"
        onClick={onClose}
        className="block mx-auto mt-4 text-[13px]"
        style={{ color: LABEL_TERTIARY, background: 'transparent' }}
      >
        Cancel
      </button>
    </Modal>
  );
}
