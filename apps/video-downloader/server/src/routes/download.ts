import type { FastifyInstance } from 'fastify';
import { config } from '../config.js';
import {
  BlockedTargetError,
  DownloadRejectedError,
  downloadHls,
  type DownloadVariant,
  type OutputFormat,
} from '../lib/hlsDownloader.js';

const VARIANTS = new Set<DownloadVariant>(['highest', 'lowest', 'first']);
const FORMATS = new Set<OutputFormat>(['mov', 'mp4']);

// The download endpoint is expensive (network fan-out + ffmpeg remux), so it
// gets a tight per-route rate limit and a small body limit. The request body is
// just a few JSON fields (playlistUrl, variant, outputFormat) and never needs
// to be large.
const DOWNLOAD_BODY_LIMIT = 8 * 1024; // 8 KiB

export default async function downloadRoutes(app: FastifyInstance) {
  app.post('/download', {
    bodyLimit: DOWNLOAD_BODY_LIMIT,
    config: {
      rateLimit: {
        max: 10,
        timeWindow: '1 minute',
      },
    },
  }, async (req, reply) => {
    const body = (req.body ?? {}) as {
      playlistUrl?: unknown;
      variant?: unknown;
      outputFormat?: unknown;
    };
    if (typeof body.playlistUrl !== 'string' || body.playlistUrl.trim() === '') {
      return reply.code(400).send({ error: 'validation', field: 'playlistUrl' });
    }
    const variant =
      typeof body.variant === 'string' && VARIANTS.has(body.variant as DownloadVariant)
        ? (body.variant as DownloadVariant)
        : 'highest';
    const outputFormat =
      typeof body.outputFormat === 'string' && FORMATS.has(body.outputFormat as OutputFormat)
        ? (body.outputFormat as OutputFormat)
        : 'mov';

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.jobTimeoutMs);
    try {
      const result = await downloadHls({
        playlistUrl: body.playlistUrl.trim(),
        variant,
        outputFormat,
        signal: controller.signal,
      });
      return reply
        .header('content-type', result.mediaType)
        .header('content-disposition', `attachment; filename="${result.filename}"`)
        .send(result.bytes);
    } catch (err) {
      if (controller.signal.aborted) {
        return reply.code(400).send({ error: 'job_timeout' });
      }
      if (err instanceof BlockedTargetError) {
        return reply.code(400).send({ error: 'blocked_target' });
      }
      if (err instanceof DownloadRejectedError) {
        return reply.code(400).send({ error: err.message });
      }
      req.log.error({ err }, 'download failed');
      return reply.code(500).send({ error: 'download_failed' });
    } finally {
      clearTimeout(timer);
    }
  });
}
