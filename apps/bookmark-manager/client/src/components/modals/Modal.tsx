import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { COLORS, RING_STRONG, LABEL_SECONDARY } from '../../lib/colors';

interface Props {
  title: string;
  onClose: () => void;
  children: ReactNode;
  maxWidth?: number;
}

export default function Modal({ title, onClose, children, maxWidth = 380 }: Props) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.65)' }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-full rounded-2xl overflow-hidden"
        style={{
          maxWidth,
          background: COLORS.card,
          boxShadow: `0 0 0 1px ${RING_STRONG}, 0 8px 28px rgba(0,0,0,0.55)`,
        }}
      >
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <h2 className="text-[17px] font-semibold text-white">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center"
            aria-label="Close"
            style={{ color: LABEL_SECONDARY, background: COLORS.surface }}
          >
            <X size={16} />
          </button>
        </div>
        <div className="px-4 pb-4">{children}</div>
      </div>
    </div>
  );
}
