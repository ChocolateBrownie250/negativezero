import { useState } from 'react';
import { X } from 'lucide-react';
import DropdownPanel from './menus/DropdownPanel';
import { NODE_ICONS, ICON_COLORS, ICON_EMOJI } from '../lib/nodeIcons';
import {
  COLORS,
  LABEL_PRIMARY,
  LABEL_SECONDARY,
  RING_STRONG,
} from '../lib/colors';
import type { NodeIcon } from '../lib/tree';

interface Props {
  anchorEl: HTMLElement | null;
  current: NodeIcon | null;
  onPick: (icon: NodeIcon | null) => void;
  onClose: () => void;
}

// A small popover anchored to a card's icon: pick a background color, then an
// emoji or a named icon. Picking applies immediately and closes. "Reset" clears
// the custom icon (back to favicon / default folder glyph).
export default function IconPicker({ anchorEl, current, onPick, onClose }: Props) {
  const [bg, setBg] = useState<string>(current?.bg ?? ICON_COLORS[0]);
  const [tab, setTab] = useState<'emoji' | 'icon'>(
    current?.lucide ? 'icon' : 'emoji',
  );

  return (
    <DropdownPanel anchorEl={anchorEl} onClose={onClose} width={300}>
      <div className="p-3">
        {/* Background color swatches */}
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          {ICON_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setBg(c)}
              className="w-6 h-6 rounded-full shrink-0 transition-transform hover:scale-110"
              style={{
                background: c,
                boxShadow:
                  bg === c
                    ? `0 0 0 2px ${COLORS.card}, 0 0 0 4px ${c}`
                    : 'inset 0 0 0 1px rgba(0,0,0,0.25)',
              }}
              aria-label={`Background ${c}`}
            />
          ))}
        </div>

        {/* Emoji / Icons tabs */}
        <div className="flex gap-1 mb-2">
          {(['emoji', 'icon'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className="px-3 py-1 rounded-lg text-[13px] font-medium transition-colors"
              style={{
                background: tab === t ? COLORS.surface : 'transparent',
                color: tab === t ? LABEL_PRIMARY : LABEL_SECONDARY,
              }}
            >
              {t === 'emoji' ? 'Emoji' : 'Icons'}
            </button>
          ))}
        </div>

        {tab === 'emoji' ? (
          <div className="grid grid-cols-8 gap-1">
            {ICON_EMOJI.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => {
                  onPick({ emoji: e, bg });
                  onClose();
                }}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-[18px] leading-none transition-colors hover:bg-white/10"
                aria-label={`Emoji ${e}`}
              >
                {e}
              </button>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-6 gap-1.5">
            {Object.entries(NODE_ICONS).map(([name, Icon]) => (
              <button
                key={name}
                type="button"
                onClick={() => {
                  onPick({ lucide: name, bg });
                  onClose();
                }}
                className="w-9 h-9 rounded-lg flex items-center justify-center transition-transform hover:scale-105"
                style={{ background: bg }}
                aria-label={`Icon ${name}`}
              >
                <Icon size={18} color="#fff" />
              </button>
            ))}
          </div>
        )}

        {current && (
          <button
            type="button"
            onClick={() => {
              onPick(null);
              onClose();
            }}
            className="mt-3 w-full py-2 rounded-lg text-[13px] font-medium flex items-center justify-center gap-1.5 transition-colors hover:bg-white/5"
            style={{
              color: LABEL_SECONDARY,
              boxShadow: `inset 0 0 0 1px ${RING_STRONG}`,
            }}
          >
            <X size={14} /> Reset to default
          </button>
        )}
      </div>
    </DropdownPanel>
  );
}
