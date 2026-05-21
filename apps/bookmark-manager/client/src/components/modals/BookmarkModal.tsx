import { useState, type FormEvent } from 'react';
import Modal from './Modal';
import { COLORS, RING_STRONG, LABEL_SECONDARY } from '../../lib/colors';

interface Props {
  onClose: () => void;
  onSubmit: (data: { url: string; name: string }) => Promise<void> | void;
}

export default function BookmarkModal({ onClose, onSubmit }: Props) {
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!url.trim() || submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      await onSubmit({ url: url.trim(), name: name.trim() });
      onClose();
    } catch (err: unknown) {
      const message = (err as { payload?: { error?: string } })?.payload?.error;
      if (message === 'blocked_target') setError('That URL is blocked.');
      else setError('Could not add bookmark.');
      setSubmitting(false);
    }
  }

  return (
    <Modal title="New Bookmark" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <label
          className="block text-[13px] font-medium mb-1"
          style={{ color: LABEL_SECONDARY }}
        >
          URL
        </label>
        <input
          autoFocus
          type="text"
          inputMode="url"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder="example.com"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="w-full rounded-xl px-4 py-3 mb-3"
          style={{
            background: COLORS.surface,
            boxShadow: `inset 0 0 0 1px ${RING_STRONG}, inset 0 1px 0 rgba(0,0,0,0.20)`,
          }}
        />
        <label
          className="block text-[13px] font-medium mb-1"
          style={{ color: LABEL_SECONDARY }}
        >
          Name (optional)
        </label>
        <input
          type="text"
          placeholder="Leave blank to use page title"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-xl px-4 py-3 mb-3"
          style={{
            background: COLORS.surface,
            boxShadow: `inset 0 0 0 1px ${RING_STRONG}, inset 0 1px 0 rgba(0,0,0,0.20)`,
          }}
        />
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
            disabled={!url.trim() || submitting}
            className="rounded-xl py-3 text-white font-semibold disabled:opacity-50"
            style={{
              background: COLORS.blue,
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.20)',
            }}
          >
            {submitting ? 'Adding...' : 'Add'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
