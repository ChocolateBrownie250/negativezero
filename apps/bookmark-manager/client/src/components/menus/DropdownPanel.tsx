import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

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
    if (!anchorEl) return;
    function compute() {
      if (!anchorEl) return;
      const rect = anchorEl.getBoundingClientRect();
      const padding = 8;
      // Measured once the panel has rendered; lets us flip above the anchor
      // when opening below would overflow the viewport bottom (e.g. a row's
      // ⋯ menu near the bottom of the list on a short phone screen).
      const menuH = ref.current?.offsetHeight ?? 0;
      let top = rect.bottom + 6;
      if (menuH && top + menuH > window.innerHeight - padding) {
        top = Math.max(padding, rect.top - menuH - 6);
      }
      let left = align === 'end' ? rect.right - width : rect.left;
      const maxLeft = window.innerWidth - width - padding;
      if (left > maxLeft) left = maxLeft;
      if (left < padding) left = padding;
      setPos({ top, left });
    }
    compute();
    // Second pass after first paint so offsetHeight is known (enables the flip).
    const raf = requestAnimationFrame(compute);
    window.addEventListener('resize', compute);
    window.addEventListener('scroll', onClose, true);
    return () => {
      cancelAnimationFrame(raf);
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

  // Portal to <body>: the menu is `position: fixed`, but a transformed /
  // backdrop-filtered ancestor (the glass surfaces + aurora used throughout
  // the app) would make `fixed` resolve against that ancestor instead of the
  // viewport — which made the menu float off mid-screen on mobile. Rendering
  // at the document root removes every containing-block ancestor.
  return createPortal(
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
    </div>,
    document.body,
  );
}
