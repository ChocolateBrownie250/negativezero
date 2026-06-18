import { useState } from 'react';
import { ShieldAlert, LogOut } from 'lucide-react';
import { api } from '../api';
import {
  COLORS,
  RING_STRONG,
  LABEL_SECONDARY,
  LABEL_TERTIARY,
} from '../lib/colors';
import RegisterModal from '../components/modals/RegisterModal';

interface Props {
  onSignedOut: () => void;
}

export default function NoAdmin({ onSignedOut }: Props) {
  const [modal, setModal] = useState(false);

  async function onSignOut() {
    try {
      await api.logout();
    } catch {
      // ignore
    }
    onSignedOut();
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: COLORS.bg }}
    >
      <div
        className="w-full max-w-sm rounded-2xl p-6"
        style={{
          background: COLORS.card,
          boxShadow: `0 0 0 1px ${RING_STRONG}, 0 8px 28px rgba(0,0,0,0.55)`,
        }}
      >
        <div className="flex items-center justify-center mb-4">
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center"
            style={{ background: COLORS.surface }}
          >
            <ShieldAlert size={22} color="#ffffff" />
          </div>
        </div>
        <h1 className="text-[22px] font-semibold text-white text-center mb-1">
          Admin
        </h1>
        <p
          className="text-[13px] text-center mb-5"
          style={{ color: LABEL_SECONDARY }}
        >
          This account doesn't have admin access.
        </p>

        <button
          type="button"
          onClick={onSignOut}
          className="w-full rounded-xl py-3 flex items-center justify-center gap-2 text-[13px] font-semibold"
          style={{
            background: COLORS.surface,
            color: LABEL_SECONDARY,
            boxShadow: `0 0 0 1px ${RING_STRONG}`,
          }}
        >
          <LogOut size={16} />
          Sign out
        </button>

        <button
          type="button"
          onClick={() => setModal(true)}
          className="block mx-auto mt-4 text-[13px]"
          style={{ color: LABEL_TERTIARY, background: 'transparent' }}
        >
          Have an invite code? Register
        </button>
      </div>

      {modal && (
        <RegisterModal
          mode="first"
          onClose={() => setModal(false)}
          onDone={() => {
            setModal(false);
            // A successful enroll mints a fresh SSO session; reload so the app
            // re-evaluates auth (and admin) state from scratch.
            window.location.reload();
          }}
        />
      )}
    </div>
  );
}
