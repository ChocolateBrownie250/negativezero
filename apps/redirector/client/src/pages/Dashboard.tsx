import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  Check,
  Copy,
  Link as LinkIcon,
  LogOut,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import { api, redirectUrl, UnauthorizedError, type Redirect } from '../api';
import {
  COLORS,
  LABEL_SECONDARY,
  LABEL_TERTIARY,
  RING_STRONG,
} from '../lib/colors';
import EditModal from '../components/modals/EditModal';
import { redirectErrorLabel } from '../lib/errors';

interface Props {
  onUnauthorized: () => void;
}

function hostOf(target: string): string {
  try {
    return new URL(target).host;
  } catch {
    return target;
  }
}

export default function Dashboard({ onUnauthorized }: Props) {
  const [redirects, setRedirects] = useState<Redirect[] | null>(null);
  const [target, setTarget] = useState('');
  const [title, setTitle] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Redirect | null>(null);

  function handleError(err: unknown) {
    if (err instanceof UnauthorizedError) onUnauthorized();
    else {
      const msg = (err as Error).message || 'request_failed';
      setError(redirectErrorLabel(msg, msg));
    }
  }

  useEffect(() => {
    let cancelled = false;
    api.redirects
      .list()
      .then((r) => {
        if (!cancelled) setRedirects(r.redirects);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof UnauthorizedError) onUnauthorized();
        else setRedirects([]);
      });
    return () => {
      cancelled = true;
    };
  }, [onUnauthorized]);

  async function onLogout() {
    try {
      await api.logout();
    } catch {
      // ignore
    }
    onUnauthorized();
  }

  async function onCreate() {
    if (creating || !target.trim()) return;
    setError(null);
    setCreating(true);
    try {
      const { redirect } = await api.redirects.create({
        target: target.trim(),
        title: title.trim(),
      });
      setRedirects((prev) => [redirect, ...(prev ?? [])]);
      setTarget('');
      setTitle('');
      await copyLink(redirect);
    } catch (err) {
      handleError(err);
    } finally {
      setCreating(false);
    }
  }

  async function copyLink(redirect: Redirect) {
    const url = redirectUrl(redirect.slug);
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(redirect.id);
      window.setTimeout(
        () => setCopiedId((cur) => (cur === redirect.id ? null : cur)),
        1500,
      );
    } catch {
      // clipboard blocked — no-op; the link is still visible on the card
    }
  }

  async function onDelete(redirect: Redirect) {
    if (!window.confirm('Delete this redirect? The short link will stop working.'))
      return;
    try {
      await api.redirects.remove(redirect.id);
      setRedirects((prev) => (prev ?? []).filter((r) => r.id !== redirect.id));
    } catch (err) {
      handleError(err);
    }
  }

  return (
    <div
      className="min-h-screen px-4 py-8"
      style={{
        paddingTop: 'calc(2rem + env(safe-area-inset-top))',
        paddingBottom: 'calc(2rem + env(safe-area-inset-bottom))',
      }}
    >
      <div className="max-w-3xl mx-auto">
        <header className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-[22px] font-semibold text-white">Redirector</h1>
            <p className="text-[13px]" style={{ color: LABEL_TERTIARY }}>
              negativezero services
            </p>
          </div>
          <button
            type="button"
            onClick={onLogout}
            className="rounded-xl px-3 py-2 flex items-center gap-2 text-[13px]"
            style={{
              background: COLORS.surface,
              color: LABEL_SECONDARY,
              boxShadow: `0 0 0 1px ${RING_STRONG}`,
            }}
          >
            <LogOut size={14} />
            Sign out
          </button>
        </header>

        <section
          className="rounded-2xl p-5 mb-6"
          style={{ background: COLORS.card, boxShadow: `0 0 0 1px ${RING_STRONG}` }}
        >
          <div className="flex items-center gap-2 mb-5">
            <LinkIcon size={17} color={COLORS.blue} />
            <h2 className="text-[15px] font-semibold text-white">New redirect</h2>
          </div>

          <label
            className="block text-[12px] mb-1"
            style={{ color: LABEL_SECONDARY }}
            htmlFor="target"
          >
            Destination URL
          </label>
          <input
            id="target"
            type="url"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onCreate();
            }}
            placeholder="https://example.com/some/long/page"
            className="w-full rounded-xl px-3 py-3 text-[14px] mb-4"
            style={{
              background: COLORS.surface,
              color: COLORS.ink,
              border: '1px solid rgba(255,255,255,0.08)',
            }}
          />

          <label
            className="block text-[12px] mb-1"
            style={{ color: LABEL_SECONDARY }}
            htmlFor="title"
          >
            Label (optional)
          </label>
          <input
            id="title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onCreate();
            }}
            placeholder="e.g. Quarterly report"
            className="w-full rounded-xl px-3 py-3 text-[14px] mb-5"
            style={{
              background: COLORS.surface,
              color: COLORS.ink,
              border: '1px solid rgba(255,255,255,0.08)',
            }}
          />

          <button
            type="button"
            onClick={onCreate}
            disabled={creating || !target.trim()}
            className="w-full rounded-xl py-3 text-white font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
            style={{
              background: COLORS.blue,
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.20)',
            }}
          >
            <Plus size={18} />
            {creating ? 'Creating…' : 'Create short link'}
          </button>

          {error && (
            <div
              className="mt-4 rounded-xl p-3 text-[13px] flex items-center gap-2"
              style={{
                color: COLORS.red,
                background: 'rgba(255, 69, 58, 0.08)',
                boxShadow: '0 0 0 1px rgba(255, 69, 58, 0.18)',
              }}
              role="alert"
            >
              <AlertTriangle size={15} />
              {error}
            </div>
          )}
        </section>

        <section className="space-y-3">
          {redirects === null && (
            <p className="text-[13px]" style={{ color: LABEL_TERTIARY }}>
              Loading…
            </p>
          )}
          {redirects !== null && redirects.length === 0 && (
            <p className="text-[13px]" style={{ color: LABEL_TERTIARY }}>
              No redirects yet. Create your first short link above.
            </p>
          )}
          {(redirects ?? []).map((r) => {
            const link = redirectUrl(r.slug);
            return (
              <div
                key={r.id}
                className="rounded-2xl p-4"
                style={{
                  background: COLORS.card,
                  boxShadow: `0 0 0 1px ${RING_STRONG}`,
                }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[15px] font-semibold text-white truncate">
                      {r.title || hostOf(r.target)}
                    </div>
                    <a
                      href={r.target}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[13px] inline-flex items-center gap-1 truncate max-w-full"
                      style={{ color: LABEL_SECONDARY }}
                    >
                      <span className="truncate">{r.target}</span>
                      <ArrowUpRight size={13} />
                    </a>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => setEditing(r)}
                      aria-label="Edit"
                      className="rounded-lg p-2"
                      style={{ background: COLORS.surface, color: LABEL_SECONDARY }}
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(r)}
                      aria-label="Delete"
                      className="rounded-lg p-2"
                      style={{ background: COLORS.surface, color: COLORS.red }}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2 mt-3">
                  <code
                    className="flex-1 rounded-lg px-3 py-2 text-[13px] truncate"
                    style={{ background: COLORS.surface, color: COLORS.ink }}
                    title={link}
                  >
                    {link}
                  </code>
                  <button
                    type="button"
                    onClick={() => copyLink(r)}
                    className="rounded-lg px-3 py-2 flex items-center gap-1 text-[13px]"
                    style={{
                      background: COLORS.surface,
                      color: copiedId === r.id ? COLORS.green : LABEL_SECONDARY,
                      boxShadow: `0 0 0 1px ${RING_STRONG}`,
                    }}
                  >
                    {copiedId === r.id ? <Check size={14} /> : <Copy size={14} />}
                    {copiedId === r.id ? 'Copied' : 'Copy'}
                  </button>
                </div>

                <div
                  className="text-[12px] mt-2"
                  style={{ color: LABEL_TERTIARY }}
                >
                  {r.hits} {r.hits === 1 ? 'hit' : 'hits'}
                </div>
              </div>
            );
          })}
        </section>
      </div>

      {editing && (
        <EditModal
          redirect={editing}
          onClose={() => setEditing(null)}
          onSaved={(next) => {
            setRedirects((prev) =>
              (prev ?? []).map((r) => (r.id === next.id ? next : r)),
            );
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}
