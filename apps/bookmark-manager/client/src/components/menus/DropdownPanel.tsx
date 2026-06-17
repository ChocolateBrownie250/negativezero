import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

interface Props {
  anchorEl: HTMLElement | null;
  align?: 'start' | 'end';
  onClose: () => void;
  children: ReactNode;
  width?: number;
}

export default function DropdownPanel({
  anchorEl,
  align = 'end',
  onClose,
  children,
  width = 220,
}: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    function compute() {
      if (!anchorEl) return;
      const rect = anchorEl.getBoundingClientRect();
      const top = rect.bottom + 6;
      let left = align === 'end' ? rect.right - width : rect.left;
      const padding = 8;
      const maxLeft = window.innerWidth - width - padding;
      if (left > maxLeft) left = maxLeft;
      if (left < padding) left = padding;
      setPos({ top, left });
    }
    compute();
    window.addEventListener('resize', compute);
    window.addEventListener('scroll', onClose, true);
    return () => {
      window.removeEventListener('resize', compute);
      window.removeEventListener('scroll', onClose, true);
    };
  }, [anchorEl, align, width, onClose]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    function onPointerDown(e: Event) {
      const target = e.target as Node | null;
      if (!target) return;
      if (ref.current?.contains(target)) return;
      if (anchorEl?.contains(target)) return;
      onClose();
    }
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown, { passive: true });
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
    };
  }, [anchorEl, onClose]);

  if (!pos) return null;

  return (
    <div
      ref={ref}
      role="menu"
      className="glass-surface fixed z-50 rounded-xl py-1 overflow-hidden"
      style={{
        top: pos.top,
        left: pos.left,
        width,
      }}
    >
      {children}
    </div>
  );
}
