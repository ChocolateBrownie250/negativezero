import type { ReactNode } from 'react';
import { COLORS, RING_STRONG } from '../../lib/colors';

interface Props {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}

export default function Modal({ title, onClose, children, footer }: Props) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: 'rgba(0,0,0,0.55)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl p-6"
        style={{
          background: COLORS.card,
          boxShadow: `0 0 0 1px ${RING_STRONG}, 0 8px 28px rgba(0,0,0,0.55)`,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-[17px] font-semibold text-white mb-4">{title}</h2>
        <div>{children}</div>
        {footer && <div className="mt-5">{footer}</div>}
      </div>
    </div>
  );
}
