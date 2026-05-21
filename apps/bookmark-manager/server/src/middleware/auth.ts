import type { FastifyReply, FastifyRequest } from 'fastify';

export async function requireAuth(req: FastifyRequest, reply: FastifyReply) {
  const userId = req.session.get('userId');
  if (userId !== 'owner') {
    reply.code(401).send({ error: 'unauthorized' });
  }
}

declare module '@fastify/secure-session' {
  interface SessionData {
    userId?: 'owner';
    regChallenge?: string;
    authChallenge?: string;
  }
}
