import { useState } from 'react';
import { ChevronDown, ChevronRight, Copy, KeyRound, Plus, Trash2 } from 'lucide-react';
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

  const [label, setLabel] = useState('');
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<Created | null>(null);
  const [copied, setCopied] = useState(false);

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
        API tokens (tts)
      </button>

      {expanded && (
        <div
          className="rounded-xl p-3 mt-2"
          style={{ background: COLORS.surface, boxShadow: `0 0 0 1px ${RING_STRONG}` }}
        >
          {error && (
            <div
              className="text-[12px] mb-2"
              style={{ color: COLORS.red }}
              role="alert"
            >
              {error}
            </div>
          )}

          {loading ? (
            <div className="text-[12px] py-2" style={{ color: LABEL_TERTIARY }}>
              Loading…
            </div>
          ) : tokens.length === 0 ? (
            <div className="text-[12px] py-1" style={{ color: LABEL_TERTIARY }}>
              No tokens yet.
            </div>
          ) : (
            <ul className="mb-2">
              {tokens.map((t) => (
                <li
                  key={t.id}
                  className="flex items-center justify-between py-1.5 border-t border-white/5 first:border-t-0"
                  style={{ opacity: t.revoked ? 0.55 : 1 }}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] truncate" style={{ color: COLORS.ink }}>
                        {t.label || '(no label)'}
                      </span>
                      {t.revoked && (
                        <span
                          className="rounded-md px-1.5 py-0.5 text-[10px] uppercase tracking-wider"
                          style={{ background: COLORS.card, color: COLORS.red }}
                        >
                          revoked
                        </span>
                      )}
                    </div>
                    <div className="text-[11px]" style={{ color: LABEL_TERTIARY }}>
                      created {fmtDate(t.createdAt)} · last used{' '}
                      {t.lastUsed ? fmtDate(t.lastUsed) : 'never'}
                    </div>
                  </div>
                  {!t.revoked && (
                    <button
                      type="button"
                      onClick={() => onRevoke(t)}
                      disabled={busy === t.id}
                      title="Revoke"
                      className="rounded-lg px-2 py-1 text-[12px] flex items-center gap-1 shrink-0 ml-2 disabled:opacity-50"
                      style={{ background: COLORS.card, color: COLORS.red }}
                    >
                      <Trash2 size={12} />
                      Revoke
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}

          {created && (
            <div
              className="rounded-xl p-3 mb-2"
              style={{ background: COLORS.card, boxShadow: `0 0 0 1px ${RING_STRONG}` }}
            >
              <div
                className="text-[11px] uppercase tracking-wider mb-1"
                style={{ color: LABEL_TERTIARY }}
              >
                Token{created.label ? ` · ${created.label}` : ''} — copy it now, it
                won't be shown again
              </div>
              <div className="flex items-start gap-2">
                <div
                  className="flex-1 font-mono text-[12px] break-all select-all"
                  style={{ color: COLORS.ink }}
                >
                  {created.token}
                </div>
                <button
                  type="button"
                  onClick={() => copy(created.token)}
                  className="rounded-lg px-2 py-1 text-[12px] flex items-center gap-1 shrink-0"
                  style={{ background: COLORS.surface, color: LABEL_SECONDARY }}
                >
                  <Copy size={12} />
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>
          )}

          <div className="flex items-center gap-2">
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Label (optional) e.g. 'iPhone Shortcut'"
              className="flex-1 rounded-lg px-2.5 py-1.5 text-[13px]"
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
              className="rounded-lg px-2.5 py-1.5 text-[12px] flex items-center gap-1 shrink-0 disabled:opacity-50"
              style={{ background: COLORS.blue, color: '#fff' }}
            >
              <Plus size={12} />
              {creating ? 'Creating…' : 'Create token'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
