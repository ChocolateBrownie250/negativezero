import type { FastifyInstance } from 'fastify';
import { validatePresentationDocument } from '../lib/presentationSchema.js';

export default async function presentationRoutes(app: FastifyInstance) {
  app.post('/presentation/validate', async (req) => {
    const body = (req.body ?? {}) as { document?: unknown };
    return validatePresentationDocument(body.document);
  });
}
