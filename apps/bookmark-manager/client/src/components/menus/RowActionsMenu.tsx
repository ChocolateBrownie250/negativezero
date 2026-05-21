import { Copy, ExternalLink, Pencil, Trash2 } from 'lucide-react';
import DropdownPanel from './DropdownPanel';
import MenuItem from './MenuItem';
import { LABEL_SECONDARY } from '../../lib/colors';

interface Props {
  anchorEl: HTMLElement | null;
  onClose: () => void;
  kind: 'bookmark' | 'folder';
  bookmarkCount?: number;
  onCopyLink?: () => void;
  onOpenAll?: () => void;
  onRename: () => void;
  onDelete: () => void;
}

export default function RowActionsMenu({
  anchorEl,
  onClose,
  kind,
  bookmarkCount = 0,
  onCopyLink,
  onOpenAll,
  onRename,
  onDelete,
}: Props) {
  return (
    <DropdownPanel anchorEl={anchorEl} onClose={onClose} width={220}>
      {kind === 'bookmark' && onCopyLink && (
        <MenuItem
          icon={<Copy size={18} color={LABEL_SECONDARY} />}
          label="Copy Link"
          onClick={() => {
            onCopyLink();
            onClose();
          }}
        />
      )}
      {kind === 'folder' && bookmarkCount > 0 && onOpenAll && (
        <MenuItem
          icon={<ExternalLink size={18} color={LABEL_SECONDARY} />}
          label={`Open All (${bookmarkCount})`}
          onClick={() => {
            onOpenAll();
            onClose();
          }}
        />
      )}
      <MenuItem
        icon={<Pencil size={18} color={LABEL_SECONDARY} />}
        label="Rename"
        onClick={() => {
          onRename();
          onClose();
        }}
      />
      <div className="my-1 mx-3 h-px" style={{ background: 'rgba(255,255,255,0.10)' }} />
      <MenuItem
        icon={<Trash2 size={18} />}
        label="Delete"
        destructive
        onClick={() => {
          onDelete();
          onClose();
        }}
      />
    </DropdownPanel>
  );
}
