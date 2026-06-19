import { useState } from 'react';
import {
  AlertTriangle,
  Download,
  Film,
  Link as LinkIcon,
  Loader2,
  LogOut,
} from 'lucide-react';
import { api, UnauthorizedError } from '../api';
import {
  COLORS,
  LABEL_SECONDARY,
  LABEL_TERTIARY,
  RING_STRONG,
} from '../lib/colors';

interface Props {
  onUnauthorized: () => void;
}

type Variant = 'highest' | 'lowest' | 'first';
type OutputFormat = 'mov' | 'mp4';

const variantOptions: Array<{ value: Variant; label: string }> = [
  { value: 'highest', label: 'Highest' },
  { value: 'lowest', label: 'Lowest' },
  { value: 'first', label: 'First' },
];

const formatOptions: Array<{ value: OutputFormat; label: string }> = [
  { value: 'mov', label: 'MOV' },
  { value: 'mp4', label: 'MP4' },
];

function errorLabel(message: string): string {
  const key = message.replace(/\s\(\d+\)$/, '');
  const labels: Record<string, string> = {
    playlist_url_must_end_with_m3u8: 'Playlist URL must end with .m3u8.',
    invalid_url: 'Invalid URL.',
    invalid_scheme: 'Use an HTTP or HTTPS URL.',
    blocked_target: 'That target is blocked.',
    encrypted_hls_not_supported: 'Encrypted HLS is not supported.',
    live_hls_not_supported: 'Live HLS is not supported.',
    too_many_segments: 'Playlist has too many segments.',
    download_too_large: 'Download is over the configured size limit.',
    ffmpeg_failed: 'Remux failed.',
    job_timeout: 'Download timed out.',
  };
  if (key.startsWith('ffmpeg_failed')) return labels.ffmpeg_failed;
  return labels[key] ?? message;
}

export default function Dashboard({ onUnauthorized }: Props) {
  const [playlistUrl, setPlaylistUrl] = useState('');
  const [variant, setVariant] = useState<Variant>('highest');
  const [outputFormat, setOutputFormat] = useState<OutputFormat>('mov');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFile, setLastFile] = useState<string | null>(null);

  async function onLogout() {
    try {
      await api.logout();
    } catch {
      // ignore
    }
    onUnauthorized();
  }

  function saveBlob(blob: Blob, filename: string) {
    const href = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = href;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(href);
  }

  async function onDownload() {
    if (submitting || !playlistUrl.trim()) return;
    setError(null);
    setLastFile(null);
    setSubmitting(true);
    try {
      const result = await api.download({
        playlistUrl: playlistUrl.trim(),
        variant,
        outputFormat,
      });
      saveBlob(result.blob, result.filename);
      setLastFile(result.filename);
    } catch (err) {
      if (err instanceof UnauthorizedError) onUnauthorized();
      else setError(errorLabel((err as Error).message || 'request_failed'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="min-h-screen px-4 py-8"
      style={{
        paddingTop: 'max(2rem, env(safe-area-inset-top))',
        paddingBottom: 'max(2rem, env(safe-area-inset-bottom))',
      }}
    >
      <div className="max-w-3xl mx-auto">
        <header className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-[22px] font-semibold text-white">
              Video Downloader
            </h1>
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
          style={{
            background: COLORS.card,
            boxShadow: `0 0 0 1px ${RING_STRONG}`,
          }}
        >
          <div className="flex items-center gap-2 mb-5">
            <Film size={17} color={COLORS.blue} />
            <h2 className="text-[15px] font-semibold text-white">
              HLS playlist
            </h2>
          </div>

          <label
            className="block text-[12px] mb-1"
            style={{ color: LABEL_SECONDARY }}
            htmlFor="playlistUrl"
          >
            URL
          </label>
          <div className="relative mb-4">
            <LinkIcon
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2"
              color={LABEL_TERTIARY}
            />
            <input
              id="playlistUrl"
              type="url"
              value={playlistUrl}
              onChange={(e) => setPlaylistUrl(e.target.value)}
              placeholder="https://example.com/video/master.m3u8"
              className="w-full rounded-xl pl-10 pr-3 py-3 text-[14px]"
              style={{
                background: COLORS.surface,
                color: COLORS.ink,
                border: '1px solid rgba(255,255,255,0.08)',
              }}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
            <div>
              <div
                className="block text-[12px] mb-2"
                style={{ color: LABEL_SECONDARY }}
              >
                Variant
              </div>
              <div
                className="grid grid-cols-3 rounded-xl p-1"
                style={{ background: COLORS.surface }}
              >
                {variantOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setVariant(option.value)}
                    className="rounded-lg py-2 text-[13px] font-medium"
                    style={{
                      color:
                        variant === option.value ? COLORS.ink : LABEL_SECONDARY,
                      background:
                        variant === option.value ? COLORS.card : 'transparent',
                    }}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div
                className="block text-[12px] mb-2"
                style={{ color: LABEL_SECONDARY }}
              >
                Container
              </div>
              <div
                className="grid grid-cols-2 rounded-xl p-1"
                style={{ background: COLORS.surface }}
              >
                {formatOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setOutputFormat(option.value)}
                    className="rounded-lg py-2 text-[13px] font-medium"
                    style={{
                      color:
                        outputFormat === option.value
                          ? COLORS.ink
                          : LABEL_SECONDARY,
                      background:
                        outputFormat === option.value
                          ? COLORS.card
                          : 'transparent',
                    }}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onDownload}
            disabled={submitting || !playlistUrl.trim()}
            className="w-full rounded-xl py-3 text-white font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
            style={{
              background: COLORS.blue,
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.20)',
            }}
          >
            {submitting ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                Downloading
              </>
            ) : (
              <>
                <Download size={18} />
                Download
              </>
            )}
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

          {lastFile && (
            <div
              className="mt-4 rounded-xl p-3 text-[13px]"
              style={{
                color: COLORS.green,
                background: 'rgba(48, 209, 88, 0.08)',
                boxShadow: '0 0 0 1px rgba(48, 209, 88, 0.18)',
              }}
            >
              Saved {lastFile}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
