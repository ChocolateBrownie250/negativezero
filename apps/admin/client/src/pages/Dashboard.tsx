import { useEffect, useState } from 'react';
import { Copy, KeyRound, LogOut, RefreshCw } from 'lucide-react';
import { api, UnauthorizedError, type GeneratedCodeLogEntry } from '../api';
import {
  COLORS,
  LABEL_SECONDARY,
  LABEL_TERTIARY,
  RING_STRONG,
} from '../lib/colors';

interface Props {
  onUnauthorized: () => void;
}

type Generated = {
  service: string;
  label: string | null;
  code: string;
  hash: string;
};

export default function Dashboard({ onUnauthorized }: Props) {
  const [services, setServices] = useState<string[]>([]);
  const [service, setService] = useState<string>('');
  const [label, setLabel] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generated, setGenerated] = useState<Generated | null>(null);
  const [log, setLog] = useState<GeneratedCodeLogEntry[]>([]);
  const [copiedField, setCopiedField] = useState<'code' | 'hash' | null>(null);

  function handleErr(err: unknown) {
    if (err instanceof UnauthorizedError) onUnauthorized();
    else setError((err as Error).message || 'request_failed');
  }

  async function refreshLog() {
    try {
      const r = await api.codes.log();
      setLog(r.codes);
    } catch (err) {
      handleErr(err);
    }
  }

  useEffect(() => {
    let cancelled = false;
    api.codes
      .services()
      .then((r) => {
        if (cancelled) return;
        setServices(r.services);
        if (r.services.length > 0) setService(r.services[0]);
      })
      .catch(handleErr);
    refreshLog();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onGenerate() {
    if (!service || submitting) return;
    setError(null);
    setGenerated(null);
    setSubmitting(true);
    try {
      const r = await api.codes.generate(service, label.trim() || undefined);
      setGenerated(r);
      setLabel('');
      refreshLog();
    } catch (err) {
      handleErr(err);
    } finally {
      setSubmitting(false);
    }
  }

  async function onLogout() {
    try {
      await api.logout();
    } catch {
      // ignore
    }
    onUnauthorized();
  }

  function copy(field: 'code' | 'hash', value: string) {
    navigator.clipboard.writeText(value).then(
      () => {
        setCopiedField(field);
        setTimeout(() => setCopiedField(null), 1400);
      },
      () => setError('Clipboard write failed'),
    );
  }

  return (
    <div
      className="min-h-screen px-4 py-8"
      style={{ background: COLORS.bg }}
    >
      <div className="max-w-2xl mx-auto">
        <header className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-[22px] font-semibold text-white">Admin</h1>
            <p
              className="text-[13px]"
              style={{ color: LABEL_TERTIARY }}
            >
              negativezero platform
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
          style={{
            background: COLORS.card,
            boxShadow: `0 0 0 1px ${RING_STRONG}`,
          }}
        >
          <div className="flex items-center gap-2 mb-4">
            <KeyRound size={16} color={COLORS.blue} />
            <h2 className="text-[15px] font-semibold text-white">
              Generate registration code
            </h2>
          </div>

          <label
            className="block text-[12px] mb-1"
            style={{ color: LABEL_SECONDARY }}
          >
            Service
          </label>
          <select
            value={service}
            onChange={(e) => setService(e.target.value)}
            className="w-full rounded-xl px-3 py-2 mb-3 text-[14px]"
            style={{
              background: COLORS.surface,
              color: COLORS.ink,
              border: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            {services.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          <label
            className="block text-[12px] mb-1"
            style={{ color: LABEL_SECONDARY }}
          >
            Label (optional — for the audit log)
          </label>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. 'igor laptop' or 'guest sept-22'"
            className="w-full rounded-xl px-3 py-2 mb-4 text-[14px]"
            style={{
              background: COLORS.surface,
              color: COLORS.ink,
              border: '1px solid rgba(255,255,255,0.08)',
            }}
          />

          <button
            type="button"
            onClick={onGenerate}
            disabled={submitting || !service}
            className="w-full rounded-xl py-3 text-white font-semibold disabled:opacity-50"
            style={{
              background: COLORS.blue,
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.20)',
            }}
          >
            {submitting ? 'Generating…' : 'Generate'}
          </button>

          {error && (
            <div
              className="text-[13px] mt-3 text-center"
              style={{ color: COLORS.red }}
              role="alert"
            >
              {error}
            </div>
          )}

          {generated && (
            <div
              className="rounded-xl p-4 mt-4"
              style={{
                background: COLORS.surface,
                boxShadow: `0 0 0 1px ${RING_STRONG}`,
              }}
            >
              <div className="mb-3">
                <div
                  className="text-[11px] uppercase tracking-wider mb-1"
                  style={{ color: LABEL_TERTIARY }}
                >
                  Code (give this to the new user — shown once)
                </div>
                <div className="flex items-center gap-2">
                  <div
                    className="flex-1 font-mono text-[15px] select-all"
                    style={{ color: COLORS.ink }}
                  >
                    {generated.code}
                  </div>
                  <button
                    type="button"
                    onClick={() => copy('code', generated.code)}
                    className="rounded-lg px-2 py-1 text-[12px] flex items-center gap-1"
                    style={{
                      background: COLORS.card,
                      color: LABEL_SECONDARY,
                    }}
                  >
                    <Copy size={12} />
                    {copiedField === 'code' ? 'Copied' : 'Copy'}
                  </button>
                </div>
              </div>

              <div>
                <div
                  className="text-[11px] uppercase tracking-wider mb-1"
                  style={{ color: LABEL_TERTIARY }}
                >
                  Bcrypt hash (paste as {generated.service.toUpperCase().replace(/-/g, '_')}_SETUP_CODE_HASH in platform/.env, then docker compose restart {generated.service})
                </div>
                <div className="flex items-center gap-2">
                  <div
                    className="flex-1 font-mono text-[11px] break-all select-all"
                    style={{ color: COLORS.ink }}
                  >
                    {generated.hash}
                  </div>
                  <button
                    type="button"
                    onClick={() => copy('hash', generated.hash)}
                    className="rounded-lg px-2 py-1 text-[12px] flex items-center gap-1 flex-shrink-0"
                    style={{
                      background: COLORS.card,
                      color: LABEL_SECONDARY,
                    }}
                  >
                    <Copy size={12} />
                    {copiedField === 'hash' ? 'Copied' : 'Copy'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>

        <section
          className="rounded-2xl p-5"
          style={{
            background: COLORS.card,
            boxShadow: `0 0 0 1px ${RING_STRONG}`,
          }}
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[15px] font-semibold text-white">
              Recent codes
            </h2>
            <button
              type="button"
              onClick={refreshLog}
              className="rounded-lg px-2 py-1 text-[12px] flex items-center gap-1"
              style={{
                background: COLORS.surface,
                color: LABEL_SECONDARY,
              }}
            >
              <RefreshCw size={12} />
              Refresh
            </button>
          </div>
          {log.length === 0 ? (
            <div
              className="text-[13px] text-center py-4"
              style={{ color: LABEL_TERTIARY }}
            >
              No codes generated yet.
            </div>
          ) : (
            <ul>
              {log.map((entry) => (
                <li
                  key={entry.id}
                  className="flex items-center justify-between py-2 border-t border-white/5 first:border-t-0"
                >
                  <div>
                    <div
                      className="text-[14px]"
                      style={{ color: COLORS.ink }}
                    >
                      {entry.service}
                      {entry.label && (
                        <span
                          className="ml-2 text-[12px]"
                          style={{ color: LABEL_TERTIARY }}
                        >
                          · {entry.label}
                        </span>
                      )}
                    </div>
                  </div>
                  <div
                    className="text-[12px] font-mono"
                    style={{ color: LABEL_TERTIARY }}
                  >
                    {new Date(entry.createdAt).toISOString().replace('T', ' ').slice(0, 16)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
