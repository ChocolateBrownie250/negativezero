import { useMemo, useState } from 'react';
import Modal from './Modal';
import { COLORS, RING_STRONG, LABEL_SECONDARY, LABEL_TERTIARY } from '../../lib/colors';
import { parseLinks } from '../../lib/parseLinks';

interface Props {
  onClose: () => void;
  onSubmit: (
    urls: string[],
    onProgress: (done: number, total: number) => void,
  ) => Promise<{ added: number; failed: number }>;
}

export default function PasteLinksModal({ onClose, onSubmit }: Props) {
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const urls = useMemo(() => parseLinks(text), [text]);

  async function handleSubmit() {
    if (submitting || urls.length === 0) return;
    setError(null);
    setSubmitting(true);
    setProgress({ done: 0, total: urls.length });
    try {
      await onSubmit(urls, (done, total) => setProgress({ done, total }));
      onClose();
    } catch {
      setError('Something went wrong while adding links.');
      setSubmitting(false);
      setProgress(null);
    }
  }

  const buttonLabel = submitting
    ? `Adding ${progress?.done ?? 0}/${progress?.total ?? urls.length}...`
    : `Add ${urls.length} ${urls.length === 1 ? 'bookmark' : 'bookmarks'}`;

  return (
    <Modal title="Paste Links" onClose={onClose} maxWidth={440}>
      <p className="text-[13px] mb-3" style={{ color: LABEL_SECONDARY }}>
        Paste links separated by new lines, spaces, or commas — for example
        every tab you selected in Safari. Each one becomes a bookmark in a new
        folder.
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={10}
        disabled={submitting}
        placeholder={'https://example.com\nhttps://news.ycombinator.com\napple.com'}
        className="w-full rounded-xl px-4 py-3 mb-1 font-mono disabled:opacity-60"
        style={{
          background: COLORS.surface,
          boxShadow: `inset 0 0 0 1px ${RING_STRONG}, inset 0 1px 0 rgba(0,0,0,0.20)`,
          fontSize: 14,
          minHeight: 180,
          resize: 'vertical',
        }}
      />
      <div className="text-[12px] mb-3 h-4" style={{ color: LABEL_TERTIARY }}>
        {text.trim()
          ? `${urls.length} ${urls.length === 1 ? 'link' : 'links'} detected`
          : ''}
      </div>
      {error && (
        <div className="text-[13px] mb-3" style={{ color: COLORS.red }}>
          {error}
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 pt-2">
        <button
          type="button"
          onClick={onClose}
          disabled={submitting}
          className="rounded-xl py-3 text-white font-medium disabled:opacity-50"
          style={{
            background: COLORS.surface,
            boxShadow: `inset 0 0 0 1px ${RING_STRONG}`,
          }}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={urls.length === 0 || submitting}
          className="rounded-xl py-3 text-white font-semibold disabled:opacity-50"
          style={{
            background: COLORS.blue,
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.20)',
          }}
        >
          {buttonLabel}
        </button>
      </div>
    </Modal>
  );
}
