import { useState, type FormEvent } from 'react';
import Modal from './Modal';
import { COLORS, RING_STRONG, LABEL_SECONDARY } from '../../lib/colors';

interface Props {
  initialName: string;
  initialUrl?: string;
  kind: 'bookmark' | 'folder';
  onClose: () => void;
  onSubmit: (data: { name: string; url?: string }) => Promise<void> | void;
}

export default function RenameModal({
  initialName,
  initialUrl,
  kind,
  onClose,
  onSubmit,
}: Props) {
  const [name, setName] = useState(initialName);
  const [url, setUrl] = useState(initialUrl ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || submitting) return;
    if (kind === 'bookmark' && !url.trim()) return;
    setError(null);
    setSubmitting(true);
    try {
      await onSubmit({
        name: name.trim(),
        url: kind === 'bookmark' ? url.trim() : undefined,
      });
      onClose();
    } catch {
      setError('Could not save.');
      setSubmitting(false);
    }
  }

  return (
    <Modal title={kind === 'bookmark' ? 'Edit Bookmark' : 'Rename Folder'} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <label
          className="block text-[13px] font-medium mb-1"
          style={{ color: LABEL_SECONDARY }}
        >
          Name
        </label>
        <input
          autoFocus
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-xl px-4 py-3 mb-3"
          style={{
            background: COLORS.surface,
            boxShadow: `inset 0 0 0 1px ${RING_STRONG}, inset 0 1px 0 rgba(0,0,0,0.20)`,
          }}
        />
        {kind === 'bookmark' && (
          <>
            <label
              className="block text-[13px] font-medium mb-1"
              style={{ color: LABEL_SECONDARY }}
            >
              URL
            </label>
            <input
              type="text"
              inputMode="url"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="w-full rounded-xl px-4 py-3 mb-3"
              style={{
                background: COLORS.surface,
                boxShadow: `inset 0 0 0 1px ${RING_STRONG}, inset 0 1px 0 rgba(0,0,0,0.20)`,
              }}
            />
          </>
        )}
        {error && (
          <div className="text-[13px] mb-3" style={{ color: COLORS.red }}>
            {error}
          </div>
        )}
        <div className="grid grid-cols-2 gap-3 pt-2">
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
            disabled={
              !name.trim() ||
              submitting ||
              (kind === 'bookmark' && !url.trim())
            }
            className="rounded-xl py-3 text-white font-semibold disabled:opacity-50"
            style={{
              background: COLORS.blue,
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.20)',
            }}
          >
            {submitting ? 'Saving...' : 'Save'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
