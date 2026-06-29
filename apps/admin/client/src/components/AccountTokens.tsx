import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Copy, KeyRound, Plus, Trash2 } from '../icons';
import { api, UnauthorizedError, type TokenInfo } from '../api';
import { COLORS, LABEL_SECONDARY, LABEL_TERTIARY, RING_STRONG } from '../lib/colors';

interface Props {
  accountId: string;
  onUnauthorized: () => void;
}

type Created = {
  id: string;
  service: string;
  label: string | null;
  token: string;
};

type Tab = 'active' | 'revoked';

function fmtDate(ts: number): string {
  return new Date(ts).toISOString().replace('T', ' ').slice(0, 16);
}

export default function AccountTokens({ accountId, onUnauthorized }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [tokens, setTokens] = useState<TokenInfo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('active');

  const [label, setLabel] = useState('');
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<Created | null>(null);
  const [copied, setCopied] = useState(false);

  const active = useMemo(() => tokens.filter((t) => !t.revoked), [tokens]);
  const revoked = useMemo(() => tokens.filter((t) => t.revoked), [tokens]);

  function handleErr(err: unknown) {
    if (err instanceof UnauthorizedError) onUnauthorized();
    else setError((err as Error).message || 'request_failed');
  }

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const r = await api.accounts.listTokens(accountId);
      setTokens(r.tokens);
      setLoaded(true);
    } catch (err) {
      handleErr(err);
    } finally {
      setLoading(false);
    }
  }

  function toggle() {
    const next = !expanded;
    setExpanded(next);
    if (next && !loaded && !loading) load();
  }

  async function onCreate() {
    if (creating) return;
    setError(null);
    setCreated(null);
    setCreating(true);
    try {
      const r = await api.accounts.createToken(accountId, label.trim() || undefined);
      setCreated(r);
      setLabel('');
      setTab('active');
      await load();
    } catch (err) {
      handleErr(err);
    } finally {
      setCreating(false);
    }
  }

  async function onRevoke(token: TokenInfo) {
    if (busy) return;
    if (
      !window.confirm(
        `Revoke token "${token.label || '(no label)'}"? Clients using it will stop working.`,
      )
    ) {
      return;
    }
    setError(null);
    setBusy(token.id);
    try {
      await api.accounts.revokeToken(accountId, token.id);
      await load();
    } catch (err) {
      handleErr(err);
    } finally {
      setBusy(null);
    }
  }

  function copy(value: string) {
    navigator.clipboard.writeText(value).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1400);
      },
      () => setError('Clipboard write failed'),
    );
  }

  // Disclosure header — show a live active count once loaded so the operator can
  // see at a glance whether an account has working tokens without expanding.
  const headerCount = loaded ? ` · ${active.length} active` : '';

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={toggle}
        className="flex items-center gap-1.5 text-[12px]"
        style={{ color: LABEL_SECONDARY, background: 'transparent' }}
      >
        {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <KeyRound size={12} />
        API tokens (tts){headerCount}
      </button>

      {expanded && (
        <div
          className="rounded-xl p-3 mt-2"
          style={{ background: COLORS.surface, boxShadow: `0 0 0 1px ${RING_STRONG}` }}
        >
          {error && (
            <div className="text-[12px] mb-2" style={{ color: COLORS.red }} role="alert">
              {error}
            </div>
          )}

          {/* Step 1 — create. Top of the panel so the flow reads top to bottom:
              name it (optional) -> Create -> copy the token that appears below. */}
          <div className="text-[12px] mb-2 leading-snug" style={{ color: LABEL_TERTIARY }}>
            Create a token, then paste it into the iPhone Shortcut API token field.
            The full token is shown once — copy it right after you create it, before
            leaving this screen.
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Name (optional) e.g. iPhone Shortcut"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              className="flex-1 rounded-lg px-3 py-2 text-[16px]"
              style={{
                background: COLORS.card,
                color: COLORS.ink,
                border: '1px solid rgba(255,255,255,0.08)',
              }}
            />
            <button
              type="button"
              onClick={onCreate}
              disabled={creating}
              className="rounded-lg px-3 py-2 text-[14px] flex items-center justify-center gap-1.5 shrink-0 disabled:opacity-50"
              style={{ background: COLORS.blue, color: '#fff' }}
            >
              <Plus size={14} />
              {creating ? 'Creating…' : 'Create token'}
            </button>
          </div>

          {/* Step 2 — the freshly created token, prominent + one-tap copy. */}
          {created && (
            <div
              className="rounded-xl p-3 mt-3"
              style={{ background: COLORS.card, boxShadow: `0 0 0 1.5px ${COLORS.blue}` }}
            >
              <div className="text-[13px] mb-2" style={{ color: COLORS.ink }}>
                ✓ New token{created.label ? ` · ${created.label}` : ''} — copy it now,
                it will not be shown again.
              </div>
              <div
                className="font-mono text-[13px] break-all select-all rounded-lg p-2.5 mb-2"
                style={{ background: COLORS.surface, color: COLORS.ink }}
              >
                {created.token}
              </div>
              <button
                type="button"
                onClick={() => copy(created.token)}
                className="w-full rounded-lg px-3 py-2.5 text-[14px] flex items-center justify-center gap-1.5"
                style={{ background: COLORS.blue, color: '#fff' }}
              >
                <Copy size={14} />
                {copied ? 'Copied ✓' : 'Copy token'}
              </button>
            </div>
          )}

          {/* Tabs — active tokens are the working set; revoked ones move to a
              separate log so they don't clutter the list you act on. */}
          <div
            className="flex gap-1 p-1 rounded-lg mt-4"
            style={{ background: COLORS.card }}
            role="tablist"
          >
            {(['active', 'revoked'] as Tab[]).map((t) => {
              const on = tab === t;
              const count = t === 'active' ? active.length : revoked.length;
              return (
                <button
                  key={t}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  onClick={() => setTab(t)}
                  className="flex-1 rounded-md py-1.5 text-[13px] capitalize transition-colors"
                  style={{
                    background: on ? COLORS.blue : 'transparent',
                    color: on ? '#fff' : LABEL_SECONDARY,
                  }}
                >
                  {t} ({count})
                </button>
              );
            })}
          </div>

          {loading ? (
            <div className="text-[13px] py-2 mt-1" style={{ color: LABEL_TERTIARY }}>
              Loading…
            </div>
          ) : tab === 'active' ? (
            active.length === 0 ? (
              <div className="text-[13px] py-2 mt-1" style={{ color: LABEL_TERTIARY }}>
                No active tokens. Create one above.
              </div>
            ) : (
              <ul className="mt-1">
                {active.map((t) => (
                  <li
                    key={t.id}
                    className="flex items-center justify-between py-2 border-t border-white/5 first:border-t-0"
                  >
                    <div className="min-w-0">
                      <div className="text-[14px] truncate" style={{ color: COLORS.ink }}>
                        {t.label || '(no label)'}
                      </div>
                      <div className="text-[11px]" style={{ color: LABEL_TERTIARY }}>
                        created {fmtDate(t.createdAt)} · last used{' '}
                        {t.lastUsed ? fmtDate(t.lastUsed) : 'never'}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onRevoke(t)}
                      disabled={busy === t.id}
                      title="Revoke"
                      className="rounded-lg px-2.5 py-1.5 text-[13px] flex items-center gap-1 shrink-0 ml-2 disabled:opacity-50"
                      style={{ background: COLORS.card, color: COLORS.red }}
                    >
                      <Trash2 size={13} />
                      Revoke
                    </button>
                  </li>
                ))}
              </ul>
            )
          ) : revoked.length === 0 ? (
            <div className="text-[13px] py-2 mt-1" style={{ color: LABEL_TERTIARY }}>
              No revoked tokens.
            </div>
          ) : (
            <ul className="mt-1">
              {revoked.map((t) => (
                <li
                  key={t.id}
                  className="py-2 border-t border-white/5 first:border-t-0"
                  style={{ opacity: 0.7 }}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-[14px] truncate" style={{ color: COLORS.ink }}>
                      {t.label || '(no label)'}
                    </span>
                    <span
                      className="rounded-md px-1.5 py-0.5 text-[10px] uppercase tracking-wider shrink-0"
                      style={{ background: COLORS.card, color: COLORS.red }}
                    >
                      revoked
                    </span>
                  </div>
                  <div className="font-mono text-[11px] mt-0.5" style={{ color: LABEL_TERTIARY }}>
                    created {fmtDate(t.createdAt)}
                    {t.revokedAt ? ` · revoked ${fmtDate(t.revokedAt)}` : ''} · last used{' '}
                    {t.lastUsed ? fmtDate(t.lastUsed) : 'never'}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
