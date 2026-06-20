import type { FastifyInstance } from 'fastify';

// Binary access check used by the client to gate the UI on load. requireAuth
// (an onRequest hook on this scope) has already run, so reaching the handler
// means the account is authorized for timezones. No data is returned.
export default async function meRoutes(app: FastifyInstance) {
  app.get('/v1/me', async () => ({ status: 'ok' }));
}
