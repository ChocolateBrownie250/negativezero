import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../index.js';
import {
  BlockedTargetError,
  DownloadRejectedError,
  downloadHls,
} from '../lib/hlsDownloader.js';

function textResponse(text: string, finalUrl?: string) {
  return {
    body: Buffer.from(text, 'utf8'),
    finalUrl,
    contentType: 'application/vnd.apple.mpegurl',
  };
}

function bytesResponse(bytes: string) {
  return {
    body: Buffer.from(bytes, 'utf8'),
    contentType: 'video/mp2t',
  };
}

describe('POST /api/download', () => {
  it('rejects unauthenticated requests', async () => {
    const app = await createApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/download',
      payload: {
        playlistUrl: 'https://example.com/master.m3u8',
        variant: 'highest',
        outputFormat: 'mov',
      },
    });
    await app.close();

    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: 'unauthorized' });
  });
});

describe('downloadHls', () => {
  it('rejects non-m3u8 inputs before fetching', async () => {
    await expect(
      downloadHls({
        playlistUrl: 'https://example.com/video.mp4',
        outputFormat: 'mov',
        variant: 'highest',
        fetchUrl: vi.fn(),
        runFfmpeg: vi.fn(),
      }),
    ).rejects.toThrow(DownloadRejectedError);
  });

  it('stops before network work when the job is already timed out', async () => {
    const controller = new AbortController();
    const fetchUrl = vi.fn();
    const runFfmpeg = vi.fn();
    controller.abort();

    await expect(
      downloadHls({
        playlistUrl: 'https://example.com/video.m3u8',
        outputFormat: 'mov',
        variant: 'highest',
        fetchUrl,
        runFfmpeg,
        signal: controller.signal,
      }),
    ).rejects.toThrow(DownloadRejectedError);
    expect(fetchUrl).not.toHaveBeenCalled();
    expect(runFfmpeg).not.toHaveBeenCalled();
  });

  it('selects the highest-bandwidth variant and remuxes clear TS segments', async () => {
    const fetchUrl = vi.fn(async (url: string) => {
      if (url === 'https://example.com/master.m3u8') {
        return textResponse(`#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=100000,RESOLUTION=640x360
low/index.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=900000,RESOLUTION=1920x1080
high/index.m3u8
`);
      }
      if (url === 'https://example.com/high/index.m3u8') {
        return textResponse(`#EXTM3U
#EXT-X-TARGETDURATION:6
#EXTINF:6,
seg-1.ts
#EXTINF:6,
seg-2.ts
#EXT-X-ENDLIST
`);
      }
      if (url.endsWith('seg-1.ts')) return bytesResponse('one');
      if (url.endsWith('seg-2.ts')) return bytesResponse('two');
      throw new Error(`unexpected fetch: ${url}`);
    });
    const runFfmpeg = vi.fn(async () => Buffer.from('movie'));

    const result = await downloadHls({
      playlistUrl: 'https://example.com/master.m3u8',
      outputFormat: 'mov',
      variant: 'highest',
      fetchUrl,
      runFfmpeg,
    });

    expect(result.filename).toBe('hls-download.mov');
    expect(result.mediaType).toBe('video/quicktime');
    expect(result.bytes.toString()).toBe('movie');
    expect(fetchUrl).toHaveBeenCalledWith(
      'https://example.com/high/index.m3u8',
      { maxBytes: expect.any(Number) },
    );
    expect(runFfmpeg).toHaveBeenCalledWith(
      expect.objectContaining({
        outputFormat: 'mov',
        inputPlaylistPath: expect.stringContaining('playlist.m3u8'),
      }),
    );
  });

  it('passes EXT-X-MAP init segments into the sanitized local playlist', async () => {
    const fetchUrl = vi.fn(async (url: string) => {
      if (url === 'https://example.com/vod.m3u8') {
        return textResponse(`#EXTM3U
#EXT-X-VERSION:7
#EXT-X-TARGETDURATION:4
#EXT-X-MAP:URI="init.mp4"
#EXTINF:4,
chunk-1.m4s
#EXT-X-ENDLIST
`);
      }
      if (url.endsWith('init.mp4')) return bytesResponse('init');
      if (url.endsWith('chunk-1.m4s')) return bytesResponse('chunk');
      throw new Error(`unexpected fetch: ${url}`);
    });
    const runFfmpeg = vi.fn(async ({ playlistText }) => {
      expect(playlistText).toContain('#EXT-X-MAP:URI="media/init-0.mp4"');
      expect(playlistText).toContain('media/segment-0.m4s');
      return Buffer.from('movie');
    });

    await downloadHls({
      playlistUrl: 'https://example.com/vod.m3u8',
      outputFormat: 'mp4',
      variant: 'first',
      fetchUrl,
      runFfmpeg,
    });
  });

  it('rejects encrypted and live playlists', async () => {
    await expect(
      downloadHls({
        playlistUrl: 'https://example.com/encrypted.m3u8',
        outputFormat: 'mov',
        variant: 'first',
        fetchUrl: vi.fn(async () =>
          textResponse(`#EXTM3U
#EXT-X-TARGETDURATION:6
#EXT-X-KEY:METHOD=AES-128,URI="key.bin"
#EXTINF:6,
seg.ts
#EXT-X-ENDLIST
`),
        ),
        runFfmpeg: vi.fn(),
      }),
    ).rejects.toThrow(DownloadRejectedError);

    await expect(
      downloadHls({
        playlistUrl: 'https://example.com/live.m3u8',
        outputFormat: 'mov',
        variant: 'first',
        fetchUrl: vi.fn(async () =>
          textResponse(`#EXTM3U
#EXT-X-TARGETDURATION:6
#EXTINF:6,
seg.ts
`),
        ),
        runFfmpeg: vi.fn(),
      }),
    ).rejects.toThrow(DownloadRejectedError);
  });

  it('rejects playlists over the configured segment limit', async () => {
    await expect(
      downloadHls({
        playlistUrl: 'https://example.com/too-many.m3u8',
        outputFormat: 'mov',
        variant: 'first',
        maxSegments: 1,
        fetchUrl: vi.fn(async () =>
          textResponse(`#EXTM3U
#EXT-X-TARGETDURATION:6
#EXTINF:6,
one.ts
#EXTINF:6,
two.ts
#EXT-X-ENDLIST
`),
        ),
        runFfmpeg: vi.fn(),
      }),
    ).rejects.toThrow(DownloadRejectedError);
  });

  it('surfaces blocked private targets', async () => {
    await expect(
      downloadHls({
        playlistUrl: 'http://127.0.0.1/video.m3u8',
        outputFormat: 'mov',
        variant: 'first',
        fetchUrl: vi.fn(),
        runFfmpeg: vi.fn(),
      }),
    ).rejects.toThrow(BlockedTargetError);
  });
});
