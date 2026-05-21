import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { COLORS, RING_STRONG } from '../../lib/colors';

interface Props {
  // Anchor by viewport coordinates (where the right-click happened).
  x: number;
  y: number;
  onClose: () => void;
  children: ReactNode;
  width?: number;
}

// Coord-anchored variant of DropdownPanel: positions the menu near the
// supplied (x, y) viewport coords (the right-click point), clamps inside
// the window, and dismisses on outside click / Escape / scroll.
export default function ContextMenu({
  x,
  y,
  onClose,
  children,
  width = 220,
}: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    function compute() {
      const padding = 8;
      const h = ref.current?.offsetHeight ?? 0;
      let top = y;
      let left = x;
      const maxLeft = window.innerWidth - width - padding;
      const maxTop = window.innerHeight - h - padding;
      if (left > maxLeft) left = maxLeft;
      if (left < padding) left = padding;
      if (top > maxTop) top = maxTop;
      if (top < padding) top = padding;
      setPos({ top, left });
    }
    compute();
    window.addEventListener('resize', compute);
    window.addEventListener('scroll', onClose, true);
    return () => {
      window.removeEventListener('resize', compute);
      window.removeEventListener('scroll', onClose, true);
    };
  }, [x, y, width, onClose]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    function onPointerDown(e: Event) {
      const target = e.target as Node | null;
      if (!target) return;
      if (ref.current?.contains(target)) return;
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
  }, [onClose]);

  // Render off-screen first so we can measure height for clamping.
  return (
    <div
      ref={ref}
      role="menu"
      className="fixed z-50 rounded-xl py-1 overflow-hidden"
      style={{
        top: pos?.top ?? -9999,
        left: pos?.left ?? -9999,
        width,
        background: COLORS.surface,
        boxShadow: `0 0 0 1px ${RING_STRONG}, 0 12px 28px rgba(0,0,0,0.55)`,
        visibility: pos ? 'visible' : 'hidden',
      }}
    >
      {children}
    </div>
  );
}
