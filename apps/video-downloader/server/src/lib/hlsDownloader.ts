import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parse } from 'hls-parser';
import { Agent, request } from 'undici';
import { config } from '../config.js';
import {
  assertPublicAddress,
  assertPublicTarget,
  BlockedTargetError,
  resolvePublicTarget,
} from './ssrf.js';

export { BlockedTargetError };

export type DownloadVariant = 'highest' | 'lowest' | 'first';
export type OutputFormat = 'mov' | 'mp4';

type FetchOptions = {
  range?: { offset?: number; length: number };
  maxBytes?: number;
  signal?: AbortSignal;
  // Shared aggregate byte budget across all concurrent fetches of one download.
  // The fetch increments `used` per received chunk and aborts when it would
  // exceed `max`, so the sum buffered across the worker pool is hard-capped at
  // ~max (+ at most one in-flight chunk per worker) rather than max * concurrency.
  budget?: { used: number; max: number };
};

type FetchResult = {
  body: Buffer;
  finalUrl?: string;
  contentType?: string;
};

export type FetchUrl = (url: string, options?: FetchOptions) => Promise<FetchResult>;

export type RunFfmpeg = (args: {
  inputPlaylistPath: string;
  outputPath: string;
  outputFormat: OutputFormat;
  playlistText: string;
  signal?: AbortSignal;
}) => Promise<Buffer>;

export type DownloadOptions = {
  playlistUrl: string;
  variant: DownloadVariant;
  outputFormat: OutputFormat;
  fetchUrl?: FetchUrl;
  runFfmpeg?: RunFfmpeg;
  maxSegments?: number;
  maxBytes?: number;
  concurrency?: number;
  signal?: AbortSignal;
};

export type DownloadResult = {
  bytes: Buffer;
  filename: string;
  mediaType: string;
};

type Variant = {
  uri: string;
  bandwidth?: number;
};

type MediaMap = {
  uri: string;
  byterange?: ByteRange;
};

type ByteRange = {
  length: number;
  offset?: number;
};

type Segment = {
  uri: string;
  duration?: number;
  title?: string;
  discontinuity?: boolean;
  gap?: boolean;
  key?: { method?: string } | null;
  map?: MediaMap | null;
  byterange?: ByteRange;
  parts?: unknown[];
};

type Playlist = {
  isMasterPlaylist: boolean;
  targetDuration?: number;
  endlist?: boolean;
  variants?: Variant[];
  segments?: Segment[];
};

type DownloadItem = {
  url: string;
  localName: string;
  range?: ByteRange;
  bytes?: Buffer;
};

export class DownloadRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DownloadRejectedError';
  }
}

const PLAYLIST_MAX_BYTES = 5_000_000;
const MAX_REDIRECTS = 5;
const HEADERS_TIMEOUT = 10_000;
const BODY_TIMEOUT = 30_000;

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DownloadRejectedError('job_timeout');
}

function assertHttpUrl(urlStr: string): URL {
  let url: URL;
  try {
    url = new URL(urlStr);
  } catch {
    throw new DownloadRejectedError('invalid_url');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new DownloadRejectedError('invalid_scheme');
  }
  return url;
}

async function assertPublicUrl(urlStr: string): Promise<URL> {
  const url = assertHttpUrl(urlStr);
  await assertPublicTarget(url.hostname);
  return url;
}

async function assertPlaylistUrl(urlStr: string): Promise<URL> {
  const url = assertHttpUrl(urlStr);
  if (!url.pathname.toLowerCase().endsWith('.m3u8')) {
    throw new DownloadRejectedError('playlist_url_must_end_with_m3u8');
  }
  await assertPublicTarget(url.hostname);
  return url;
}

function parsePlaylist(text: string): Playlist {
  try {
    return parse(text) as Playlist;
  } catch {
    throw new DownloadRejectedError('invalid_playlist');
  }
}

function rejectUnsupportedPlaylist(text: string): void {
  const keyMatches = text.match(/^#EXT-X-KEY:.*$/gim) ?? [];
  for (const line of keyMatches) {
    const method = line.match(/METHOD=([^,\s]+)/i)?.[1]?.replaceAll('"', '').toUpperCase();
    if (method && method !== 'NONE') {
      throw new DownloadRejectedError('encrypted_hls_not_supported');
    }
  }
  if (/^#EXT-X-SESSION-KEY:/im.test(text)) {
    throw new DownloadRejectedError('session_keys_not_supported');
  }
}

function selectVariant(variants: Variant[], mode: DownloadVariant): Variant {
  if (variants.length === 0) throw new DownloadRejectedError('no_variants');
  if (mode === 'first') return variants[0];
  const sorted = [...variants].sort(
    (a, b) => (a.bandwidth ?? 0) - (b.bandwidth ?? 0),
  );
  return mode === 'lowest' ? sorted[0] : sorted[sorted.length - 1];
}

function mediaTypeFor(format: OutputFormat): string {
  return format === 'mov' ? 'video/quicktime' : 'video/mp4';
}

function extFromUrl(urlStr: string, fallback: string): string {
  const ext = path.extname(new URL(urlStr).pathname).toLowerCase();
  return ext && ext.length <= 8 ? ext : fallback;
}

function localPathName(name: string): string {
  return `media/${name}`;
}

function byteRangeHeader(range: ByteRange): string {
  const start = range.offset ?? 0;
  const end = start + range.length - 1;
  return `bytes=${start}-${end}`;
}

function mapKey(map: MediaMap): string {
  return `${map.uri}|${map.byterange?.offset ?? 0}|${map.byterange?.length ?? 'all'}`;
}

function validateMediaPlaylist(playlist: Playlist, text: string, maxSegments: number): Segment[] {
  rejectUnsupportedPlaylist(text);
  if (playlist.isMasterPlaylist) {
    throw new DownloadRejectedError('expected_media_playlist');
  }
  if (!playlist.endlist && !/^#EXT-X-ENDLIST\s*$/im.test(text)) {
    throw new DownloadRejectedError('live_hls_not_supported');
  }
  const segments = playlist.segments ?? [];
  if (segments.length === 0) throw new DownloadRejectedError('no_segments');
  if (segments.length > maxSegments) {
    throw new DownloadRejectedError('too_many_segments');
  }
  for (const segment of segments) {
    if (!segment.uri) throw new DownloadRejectedError('missing_segment_uri');
    if (segment.key && segment.key.method && segment.key.method.toUpperCase() !== 'NONE') {
      throw new DownloadRejectedError('encrypted_hls_not_supported');
    }
    if (segment.parts && segment.parts.length > 0) {
      throw new DownloadRejectedError('low_latency_parts_not_supported');
    }
    if (segment.gap) {
      throw new DownloadRejectedError('gap_segments_not_supported');
    }
  }
  return segments;
}

function buildDownloadPlan(
  segments: Segment[],
  playlistUrl: string,
): { items: DownloadItem[]; playlistLines: string[] } {
  const items: DownloadItem[] = [];
  const playlistLines = ['#EXTM3U', '#EXT-X-VERSION:7'];
  let mapIndex = 0;
  let segmentIndex = 0;
  let lastMapKey: string | null = null;
  const knownMaps = new Map<string, string>();

  for (const segment of segments) {
    if (segment.discontinuity) playlistLines.push('#EXT-X-DISCONTINUITY');
    if (segment.map) {
      const key = mapKey(segment.map);
      let localName = knownMaps.get(key);
      if (!localName) {
        const url = new URL(segment.map.uri, playlistUrl).toString();
        localName = `init-${mapIndex++}${extFromUrl(url, '.mp4')}`;
        knownMaps.set(key, localName);
        items.push({
          url,
          localName,
          range: segment.map.byterange,
        });
      }
      if (lastMapKey !== key) {
        playlistLines.push(`#EXT-X-MAP:URI="${localPathName(localName)}"`);
        lastMapKey = key;
      }
    }

    const url = new URL(segment.uri, playlistUrl).toString();
    const localName = `segment-${segmentIndex++}${extFromUrl(url, '.ts')}`;
    items.push({
      url,
      localName,
      range: segment.byterange,
    });
    playlistLines.push(`#EXTINF:${segment.duration ?? 0},${segment.title ?? ''}`);
    playlistLines.push(localPathName(localName));
  }

  playlistLines.push('#EXT-X-ENDLIST');
  return { items, playlistLines };
}

async function runLimited<T>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<void>,
): Promise<void> {
  let next = 0;
  const workers = Array.from(
    { length: Math.max(1, Math.min(concurrency, items.length)) },
    async () => {
      while (next < items.length) {
        const index = next++;
        await fn(items[index], index);
      }
    },
  );
  await Promise.all(workers);
}

async function fetchPlaylist(
  fetchUrl: FetchUrl,
  url: string,
  signal?: AbortSignal,
): Promise<{ text: string; finalUrl: string }> {
  throwIfAborted(signal);
  await assertPlaylistUrl(url);
  const fetched = await fetchUrl(url, { maxBytes: PLAYLIST_MAX_BYTES, signal });
  throwIfAborted(signal);
  const finalUrl = fetched.finalUrl ?? url;
  await assertPlaylistUrl(finalUrl);
  const text = fetched.body.toString('utf8');
  if (!text.trimStart().startsWith('#EXTM3U')) {
    throw new DownloadRejectedError('invalid_playlist');
  }
  return { text, finalUrl };
}

async function downloadItems(
  items: DownloadItem[],
  mediaDir: string,
  fetchUrl: FetchUrl,
  maxBytes: number,
  concurrency: number,
  signal?: AbortSignal,
): Promise<void> {
  // Hard aggregate byte cap across all concurrent fetches, enforced WITHOUT
  // pre-reserving the budget (pre-reserving the whole remaining pool before the
  // await would make any second concurrent worker see remaining<=0 and falsely
  // reject normal multi-segment downloads). Two complementary mechanisms:
  //   1. `total` accounts ACTUAL bytes after each fetch returns and rejects once
  //      the real sum exceeds maxBytes — correct for any FetchUrl (incl. test
  //      mocks that don't stream).
  //   2. the shared `budget` is threaded into the real fetch, which increments
  //      it per received chunk and aborts mid-stream, bounding peak buffered
  //      memory to ~maxBytes (+one in-flight chunk per worker) rather than
  //      maxBytes * concurrency.
  // Per-fetch cap also bounds a single ranged fetch to the attacker-controlled
  // EXT-X-BYTERANGE length clamped to what's left of the budget.
  let total = 0;
  const budget = { used: 0, max: maxBytes };
  await runLimited(items, concurrency, async (item) => {
    throwIfAborted(signal);
    await assertPublicUrl(item.url);
    const remaining = maxBytes - total;
    if (remaining <= 0) throw new DownloadRejectedError('download_too_large');
    const perFetchCap = item.range
      ? Math.min(item.range.length, remaining)
      : remaining;
    const fetched = await fetchUrl(item.url, {
      ...(item.range ? { range: item.range } : {}),
      maxBytes: perFetchCap,
      budget,
      signal,
    });
    total += fetched.body.length;
    if (total > maxBytes) throw new DownloadRejectedError('download_too_large');
    throwIfAborted(signal);
    const finalUrl = fetched.finalUrl ?? item.url;
    await assertPublicUrl(finalUrl);
    item.bytes = fetched.body;
  });

  await fs.mkdir(mediaDir, { recursive: true });
  await Promise.all(
    items.map((item) => {
      if (!item.bytes) throw new DownloadRejectedError('missing_downloaded_segment');
      return fs.writeFile(path.join(mediaDir, item.localName), item.bytes);
    }),
  );
}

export async function downloadHls(options: DownloadOptions): Promise<DownloadResult> {
  const fetchUrl = options.fetchUrl ?? defaultFetchUrl;
  const runFfmpeg = options.runFfmpeg ?? defaultRunFfmpeg;
  const maxSegments = options.maxSegments ?? config.maxSegments;
  const maxBytes = options.maxBytes ?? config.maxBytes;
  const concurrency = options.concurrency ?? config.concurrency;
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'video-downloader-'));
  try {
    throwIfAborted(options.signal);
    const first = await fetchPlaylist(fetchUrl, options.playlistUrl, options.signal);
    rejectUnsupportedPlaylist(first.text);
    let playlist = parsePlaylist(first.text);
    let mediaUrl = first.finalUrl;
    let mediaText = first.text;

    if (playlist.isMasterPlaylist) {
      const variant = selectVariant(playlist.variants ?? [], options.variant);
      mediaUrl = new URL(variant.uri, first.finalUrl).toString();
      const media = await fetchPlaylist(fetchUrl, mediaUrl, options.signal);
      mediaUrl = media.finalUrl;
      mediaText = media.text;
      playlist = parsePlaylist(mediaText);
    }

    const segments = validateMediaPlaylist(playlist, mediaText, maxSegments);
    const { items, playlistLines } = buildDownloadPlan(segments, mediaUrl);
    const targetDuration = Math.ceil(playlist.targetDuration ?? 1);
    playlistLines.splice(2, 0, `#EXT-X-TARGETDURATION:${targetDuration}`);
    const playlistText = playlistLines.join('\n') + '\n';
    const mediaDir = path.join(tmpDir, 'media');
    await downloadItems(items, mediaDir, fetchUrl, maxBytes, concurrency, options.signal);

    const inputPlaylistPath = path.join(tmpDir, 'playlist.m3u8');
    const outputPath = path.join(tmpDir, `hls-download.${options.outputFormat}`);
    throwIfAborted(options.signal);
    await fs.writeFile(inputPlaylistPath, playlistText, 'utf8');
    const bytes = await runFfmpeg({
      inputPlaylistPath,
      outputPath,
      outputFormat: options.outputFormat,
      playlistText,
      signal: options.signal,
    });
    throwIfAborted(options.signal);
    return {
      bytes,
      filename: `hls-download.${options.outputFormat}`,
      mediaType: mediaTypeFor(options.outputFormat),
    };
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

// Build an undici Agent whose connect step ALWAYS resolves to the single,
// already-vetted IP address. This pins the TCP connection to the IP we
// validated, defeating DNS-rebinding (TOCTOU) where a second resolution at
// connect time could return a private IP. A new agent is created per hop so
// each redirect target is independently resolved, validated, and pinned.
function pinnedAgent(address: string, family: number): Agent {
  return new Agent({
    connect: {
      lookup: (_hostname, _opts, cb) => {
        // Ignore the hostname entirely; force the pinned address.
        cb(null, address, family);
      },
    },
  });
}

export async function defaultFetchUrl(urlStr: string, options: FetchOptions = {}): Promise<FetchResult> {
  let current = urlStr;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    throwIfAborted(options.signal);
    // Resolve once per hop, assert every candidate IP is public, and pin the
    // connection to the chosen vetted IP so undici cannot re-resolve to a
    // different (private) address at connect time.
    const url = assertHttpUrl(current);
    const records = await resolvePublicTarget(url.hostname);
    const pinned = records[0];
    // Defensive re-check of the pinned address before connecting.
    assertPublicAddress(pinned.address);
    const dispatcher = pinnedAgent(pinned.address, pinned.family);
    const headers: Record<string, string> = {
      'User-Agent': 'negativezero-video-downloader/1.0',
      Accept: '*/*',
    };
    if (options.range) headers.Range = byteRangeHeader(options.range);
    let res;
    try {
      // No redirect interceptor is attached, so undici does NOT follow
      // redirects: each 3xx is handled manually below and re-validated +
      // re-pinned on the next hop. This is what keeps SSRF protection effective
      // across redirects (equivalent to maxRedirections: 0).
      res = await request(current, {
        method: 'GET',
        headers,
        bodyTimeout: BODY_TIMEOUT,
        headersTimeout: HEADERS_TIMEOUT,
        dispatcher,
        signal: options.signal,
      });
    } catch (err) {
      await dispatcher.close().catch(() => {});
      throw err;
    }

    try {
      if (res.statusCode >= 300 && res.statusCode < 400) {
        const location = res.headers.location;
        const locStr = Array.isArray(location) ? location[0] : location;
        res.body.resume();
        if (!locStr) throw new DownloadRejectedError('redirect_missing_location');
        if (hop === MAX_REDIRECTS) throw new DownloadRejectedError('too_many_redirects');
        current = new URL(locStr, current).toString();
        continue;
      }
      if (res.statusCode < 200 || res.statusCode >= 300) {
        res.body.resume();
        throw new DownloadRejectedError(`upstream_http_${res.statusCode}`);
      }

      const chunks: Buffer[] = [];
      let received = 0;
      const maxBytes = options.maxBytes ?? config.maxBytes;
      const budget = options.budget;
      for await (const chunk of res.body) {
        throwIfAborted(options.signal);
        const buf = Buffer.from(chunk as Buffer);
        received += buf.length;
        // Per-fetch cap (single segment / ranged byterange).
        if (received > maxBytes) {
          res.body.destroy();
          throw new DownloadRejectedError('download_too_large');
        }
        // Shared aggregate cap across all concurrent fetches. Increment + check
        // run synchronously (no await between them), so the counter stays
        // consistent across the cooperative worker pool.
        if (budget) {
          budget.used += buf.length;
          if (budget.used > budget.max) {
            res.body.destroy();
            throw new DownloadRejectedError('download_too_large');
          }
        }
        chunks.push(buf);
      }
      const contentType = Array.isArray(res.headers['content-type'])
        ? res.headers['content-type'][0]
        : res.headers['content-type'];
      return {
        body: Buffer.concat(chunks),
        finalUrl: current,
        contentType,
      };
    } finally {
      await dispatcher.close().catch(() => {});
    }
  }
  throw new DownloadRejectedError('too_many_redirects');
}

export function defaultRunFfmpeg(args: {
  inputPlaylistPath: string;
  outputPath: string;
  outputFormat: OutputFormat;
  signal?: AbortSignal;
}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    if (args.signal?.aborted) {
      reject(new DownloadRejectedError('job_timeout'));
      return;
    }
    const child = spawn('ffmpeg', [
      '-hide_banner',
      '-loglevel',
      'error',
      '-allowed_extensions',
      'ALL',
      '-i',
      args.inputPlaylistPath,
      '-map',
      '0',
      '-c',
      'copy',
      '-movflags',
      '+faststart',
      args.outputPath,
    ]);
    let stderr = '';
    let settled = false;
    const rejectOnce = (err: unknown) => {
      if (settled) return;
      settled = true;
      reject(err);
    };
    const cleanupAbort = () => {
      args.signal?.removeEventListener('abort', abort);
    };
    const abort = () => {
      child.kill('SIGKILL');
      rejectOnce(new DownloadRejectedError('job_timeout'));
    };
    args.signal?.addEventListener('abort', abort, { once: true });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', (err) => {
      cleanupAbort();
      rejectOnce(err);
    });
    child.on('close', async (code) => {
      cleanupAbort();
      if (settled) return;
      if (code !== 0) {
        // Log ffmpeg's stderr server-side only; never leak it to the client
        // (it can reveal local paths and internal details). Return a generic
        // error message instead.
        console.error(
          `[hlsDownloader] ffmpeg exited with code ${code}: ${stderr.trim()}`,
        );
        rejectOnce(new DownloadRejectedError('ffmpeg_failed'));
        return;
      }
      try {
        const output = await fs.readFile(args.outputPath);
        if (settled) return;
        settled = true;
        resolve(output);
      } catch (err) {
        rejectOnce(err);
      }
    });
  });
}
