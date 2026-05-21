import { useEffect } from 'react';
import { COLORS, RING_STRONG } from '../lib/colors';

interface Props {
  message: string;
  onDone: () => void;
}

export default function Toast({ message, onDone }: Props) {
  useEffect(() => {
    const t = setTimeout(onDone, 1800);
    return () => clearTimeout(t);
  }, [message, onDone]);

  return (
    <div className="fixed left-0 right-0 bottom-6 flex justify-center pointer-events-none z-50 px-4">
      <div
        className="rounded-full px-4 py-2 text-[13px] font-medium text-white pointer-events-auto"
        style={{
          background: COLORS.surface,
          boxShadow: `0 0 0 1px ${RING_STRONG}, 0 6px 16px rgba(0,0,0,0.45)`,
        }}
      >
        {message}
      </div>
    </div>
  );
}
