import { Bookmark, Folder } from 'lucide-react';
import DropdownPanel from './DropdownPanel';
import MenuItem from './MenuItem';
import { COLORS } from '../../lib/colors';

interface Props {
  anchorEl: HTMLElement | null;
  onClose: () => void;
  onAddBookmark: () => void;
  onAddFolder: () => void;
}

export default function AddMenu({ anchorEl, onClose, onAddBookmark, onAddFolder }: Props) {
  return (
    <DropdownPanel anchorEl={anchorEl} onClose={onClose}>
      <MenuItem
        icon={<Bookmark size={18} color={COLORS.blue} />}
        label="New Bookmark"
        onClick={() => {
          onAddBookmark();
          onClose();
        }}
      />
      <MenuItem
        icon={<Folder size={18} color={COLORS.blue} fill={COLORS.blue} />}
        label="New Folder"
        onClick={() => {
          onAddFolder();
          onClose();
        }}
      />
    </DropdownPanel>
  );
}
