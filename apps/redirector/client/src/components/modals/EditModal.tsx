import { useState } from 'react';
import { api, type Redirect } from '../../api';
import { COLORS, LABEL_SECONDARY } from '../../lib/colors';
import { redirectErrorLabel } from '../../lib/errors';
import Modal from './Modal';

interface Props {
  redirect: Redirect;
  onClose: () => void;
  onSaved: (next: Redirect) => void;
}

export default function EditModal({ redirect, onClose, onSaved }: Props) {
  const [target, setTarget] = useState(redirect.target);
  const [title, setTitle] = useState(redirect.title ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function onSave() {
    if (saving || !target.trim()) return;
    setError(null);
    setSaving(true);
    try {
      const { redirect: next } = await api.redirects.update(redirect.id, {
        target: target.trim(),
        title: title.trim(),
      });
      onSaved(next);
    } catch (err) {
      setError(
        redirectErrorLabel(
          (err as Error).message || 'request_failed',
          'Could not save changes.',
        ),
      );
      setSaving(false);
    }
  }

  return (
    <Modal
      title="Edit redirect"
      onClose={onClose}
      footer={
        <button
          type="button"
          onClick={onSave}
          disabled={saving || !target.trim()}
          className="w-full rounded-xl py-3 text-white font-semibold disabled:opacity-50"
          style={{ background: COLORS.blue }}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      }
    >
      <label className="block text-[13px] mb-1" style={{ color: LABEL_SECONDARY }}>
        Destination URL
      </label>
      <input
        type="url"
        autoFocus
        spellCheck={false}
        value={target}
        onChange={(e) => setTarget(e.target.value)}
        className="w-full rounded-xl px-3 py-2 mb-4"
        style={{
          background: COLORS.surface,
          color: COLORS.ink,
          border: '1px solid rgba(255,255,255,0.08)',
        }}
      />
      <label className="block text-[13px] mb-1" style={{ color: LABEL_SECONDARY }}>
        Label (optional)
      </label>
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="e.g. Quarterly report"
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
    </Modal>
  );
}
