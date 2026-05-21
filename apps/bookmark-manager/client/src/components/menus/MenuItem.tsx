import type { ReactNode } from 'react';
import { COLORS, LABEL_PRIMARY } from '../../lib/colors';

interface Props {
  icon?: ReactNode;
  label: string;
  hint?: string;
  onClick: () => void;
  disabled?: boolean;
  destructive?: boolean;
}

export default function MenuItem({ icon, label, hint, onClick, disabled, destructive }: Props) {
  return (
    <button
      type="button"
      onClick={() => {
        if (disabled) return;
        onClick();
      }}
      disabled={disabled}
      className="w-full flex items-center gap-3 px-4 py-3 text-left text-[15px] disabled:opacity-40"
      style={{
        color: destructive ? COLORS.red : LABEL_PRIMARY,
        background: 'transparent',
      }}
      onPointerEnter={(e) => {
        if (disabled) return;
        (e.currentTarget as HTMLButtonElement).style.background = COLORS.raised;
      }}
      onPointerLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
      }}
    >
      {icon && <span className="w-5 h-5 flex items-center justify-center">{icon}</span>}
      <span className="flex-1 truncate">{label}</span>
      {hint && <span className="text-[13px] opacity-60 ml-2">{hint}</span>}
    </button>
  );
}
