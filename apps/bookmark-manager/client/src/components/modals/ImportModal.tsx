import { useRef, useState, type ChangeEvent } from 'react';
import Modal from './Modal';
import { COLORS, RING_STRONG, LABEL_SECONDARY } from '../../lib/colors';

interface Props {
  onClose: () => void;
  onSubmit: (tree: unknown) => Promise<void> | void;
}

function isValidTree(v: unknown): boolean {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  if (o.type !== 'folder') return false;
  if (typeof o.name !== 'string') return false;
  if (o.children !== undefined && !Array.isArray(o.children)) return false;
  if (Array.isArray(o.children)) {
    return o.children.every(isValidNode);
  }
  return true;
}
function isValidNode(v: unknown): boolean {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  if (o.type === 'folder') {
    if (typeof o.name !== 'string') return false;
    if (o.children !== undefined) {
      if (!Array.isArray(o.children)) return false;
      return o.children.every(isValidNode);
    }
    return true;
  }
  if (o.type === 'bookmark') {
    return typeof o.name === 'string' && typeof o.url === 'string';
  }
  return false;
}

export default function ImportModal({ onClose, onSubmit }: Props) {
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setText(String(reader.result ?? ''));
    };
    reader.readAsText(file);
  }

  async function handleSubmit() {
    if (submitting) return;
    setError(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      setError('Invalid JSON.');
      return;
    }
    if (!isValidTree(parsed)) {
      setError('JSON does not match expected shape.');
      return;
    }
    if (!window.confirm('This replaces all existing bookmarks. Continue?')) return;
    setSubmitting(true);
    try {
      await onSubmit(parsed);
      onClose();
    } catch {
      setError('Import failed.');
      setSubmitting(false);
    }
  }

  return (
    <Modal title="Import Bookmarks" onClose={onClose} maxWidth={440}>
      <p className="text-[13px] mb-3" style={{ color: LABEL_SECONDARY }}>
        Paste JSON or choose a file exported from Bookmarks.
      </p>
      <div className="flex gap-2 mb-3">
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          onChange={onFile}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="rounded-xl px-4 py-2 text-white font-medium text-[14px]"
          style={{
            background: COLORS.surface,
            boxShadow: `inset 0 0 0 1px ${RING_STRONG}`,
          }}
        >
          Choose file
        </button>
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={10}
        placeholder='{"type":"folder","name":"Bookmarks","children":[]}'
        className="w-full rounded-xl px-4 py-3 mb-3 font-mono"
        style={{
          background: COLORS.surface,
          boxShadow: `inset 0 0 0 1px ${RING_STRONG}, inset 0 1px 0 rgba(0,0,0,0.20)`,
          fontSize: 14,
          minHeight: 180,
          resize: 'vertical',
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
          type="button"
          onClick={handleSubmit}
          disabled={!text.trim() || submitting}
          className="rounded-xl py-3 text-white font-semibold disabled:opacity-50"
          style={{
            background: COLORS.blue,
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.20)',
          }}
        >
          {submitting ? 'Importing...' : 'Replace & Import'}
        </button>
      </div>
    </Modal>
  );
}
