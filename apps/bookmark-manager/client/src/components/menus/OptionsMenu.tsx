import { Download, Upload, LogOut } from 'lucide-react';
import DropdownPanel from './DropdownPanel';
import MenuItem from './MenuItem';
import { LABEL_SECONDARY } from '../../lib/colors';

interface Props {
  anchorEl: HTMLElement | null;
  onClose: () => void;
  onExport: () => void;
  onImport: () => void;
  onLogout: () => void;
  exportDisabled: boolean;
}

export default function OptionsMenu({
  anchorEl,
  onClose,
  onExport,
  onImport,
  onLogout,
  exportDisabled,
}: Props) {
  return (
    <DropdownPanel anchorEl={anchorEl} onClose={onClose} width={240}>
      <MenuItem
        icon={<Download size={18} color={LABEL_SECONDARY} />}
        label="Export Bookmarks"
        disabled={exportDisabled}
        onClick={() => {
          onExport();
          onClose();
        }}
      />
      <MenuItem
        icon={<Upload size={18} color={LABEL_SECONDARY} />}
        label="Import Bookmarks"
        onClick={() => {
          onImport();
          onClose();
        }}
      />
      <div className="my-1 mx-3 h-px" style={{ background: 'rgba(255,255,255,0.10)' }} />
      <MenuItem
        icon={<LogOut size={18} />}
        label="Logout"
        destructive
        onClick={() => {
          onLogout();
          onClose();
        }}
      />
    </DropdownPanel>
  );
}
