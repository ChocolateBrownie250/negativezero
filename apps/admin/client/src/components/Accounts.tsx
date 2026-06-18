import { useEffect, useState } from 'react';
import { RefreshCw, Trash2, Power, Crown } from 'lucide-react';
import { api, UnauthorizedError, type Account } from '../api';
import { COLORS, LABEL_SECONDARY, LABEL_TERTIARY, RING_STRONG } from '../lib/colors';

interface Props {
  services: string[];
  onUnauthorized: () => void;
}

export default function Accounts({ services, onUnauthorized }: Props) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  function handleErr(err: unknown) {
    if (err instanceof UnauthorizedError) onUnauthorized();
    else setError((err as Error).message || 'request_failed');
  }

  async function refresh() {
    try {
      const r = await api.accounts.list();
      setAccounts(r.accounts);
    } catch (err) {
      handleErr(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function toggleService(acc: Account, service: string, enabled: boolean) {
    if (acc.isOwner || busy) return;
    setError(null);
    setBusy(acc.id);
    // optimistic
    setAccounts((prev) =>
      prev.map((a) =>
        a.id === acc.id
          ? { ...a, services: { ...a.services, [service]: enabled } }
          : a,
      ),
    );
    try {
      await api.accounts.setService(acc.id, service, enabled);
    } catch (err) {
      handleErr(err);
      refresh();
    } finally {
      setBusy(null);
    }
  }

  async function toggleStatus(acc: Account) {
    if (acc.isOwner || busy) return;
    setError(null);
    setBusy(acc.id);
    const next = acc.status === 'active' ? 'disabled' : 'active';
    try {
      await api.accounts.setStatus(acc.id, next);
      setAccounts((prev) =>
        prev.map((a) => (a.id === acc.id ? { ...a, status: next } : a)),
      );
    } catch (err) {
      handleErr(err);
    } finally {
      setBusy(null);
    }
  }

  async function remove(acc: Account) {
    if (acc.isOwner || busy) return;
    if (!window.confirm(`Delete account "${acc.name}"? This cannot be undone.`)) {
      return;
    }
    setError(null);
    setBusy(acc.id);
    try {
      await api.accounts.remove(acc.id);
      setAccounts((prev) => prev.filter((a) => a.id !== acc.id));
    } catch (err) {
      handleErr(err);
    } finally {
      setBusy(null);
    }
  }

  return (
    <section
      className="rounded-2xl p-5 mb-6"
      style={{
        background: COLORS.card,
        boxShadow: `0 0 0 1px ${RING_STRONG}`,
      }}
    >
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-[15px] font-semibold text-white">Accounts</h2>
        <button
          type="button"
          onClick={refresh}
          className="rounded-lg px-2 py-1 text-[12px] flex items-center gap-1"
          style={{ background: COLORS.surface, color: LABEL_SECONDARY }}
        >
          <RefreshCw size={12} />
          Refresh
        </button>
      </div>

      {error && (
        <div
          className="text-[13px] mb-3 text-center"
          style={{ color: COLORS.red }}
          role="alert"
        >
          {error}
        </div>
      )}

      {loading ? (
        <div
          className="text-[13px] text-center py-4"
          style={{ color: LABEL_TERTIARY }}
        >
          Loading…
        </div>
      ) : accounts.length === 0 ? (
        <div
          className="text-[13px] text-center py-4"
          style={{ color: LABEL_TERTIARY }}
        >
          No accounts yet.
        </div>
      ) : (
        <ul>
          {accounts.map((acc) => (
            <li
              key={acc.id}
              className="py-3 border-t border-white/5 first:border-t-0"
              style={{ opacity: acc.status === 'disabled' ? 0.55 : 1 }}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="text-[14px] truncate"
                    style={{ color: COLORS.ink }}
                  >
                    {acc.name}
                  </span>
                  {acc.isOwner && (
                    <span
                      className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] uppercase tracking-wider"
                      style={{ background: COLORS.surface, color: COLORS.yellow }}
                    >
                      <Crown size={10} />
                      Owner
                    </span>
                  )}
                  <span
                    className="rounded-md px-1.5 py-0.5 text-[10px] uppercase tracking-wider"
                    style={{
                      background: COLORS.surface,
                      color:
                        acc.status === 'active' ? COLORS.green : COLORS.red,
                    }}
                  >
                    {acc.status}
                  </span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <span
                    className="text-[11px] font-mono mr-1"
                    style={{ color: LABEL_TERTIARY }}
                  >
                    {new Date(acc.createdAt)
                      .toISOString()
                      .replace('T', ' ')
                      .slice(0, 16)}
                  </span>
                  {!acc.isOwner && (
                    <>
                      <button
                        type="button"
                        onClick={() => toggleStatus(acc)}
                        disabled={busy === acc.id}
                        title={
                          acc.status === 'active' ? 'Disable' : 'Enable'
                        }
                        className="rounded-lg px-2 py-1 text-[12px] flex items-center gap-1 disabled:opacity-50"
                        style={{
                          background: COLORS.surface,
                          color: LABEL_SECONDARY,
                        }}
                      >
                        <Power size={12} />
                        {acc.status === 'active' ? 'Disable' : 'Enable'}
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(acc)}
                        disabled={busy === acc.id}
                        title="Delete"
                        className="rounded-lg px-2 py-1 text-[12px] flex items-center gap-1 disabled:opacity-50"
                        style={{ background: COLORS.surface, color: COLORS.red }}
                      >
                        <Trash2 size={12} />
                      </button>
                    </>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-3">
                {services.map((s) => {
                  const enabled = acc.isOwner ? true : !!acc.services[s];
                  return (
                    <label
                      key={s}
                      className="flex items-center gap-1.5 text-[13px]"
                      style={{
                        color: enabled ? COLORS.ink : LABEL_TERTIARY,
                        cursor: acc.isOwner ? 'not-allowed' : 'pointer',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={enabled}
                        disabled={acc.isOwner || busy === acc.id}
                        onChange={(e) =>
                          toggleService(acc, s, e.target.checked)
                        }
                      />
                      {s}
                    </label>
                  );
                })}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
