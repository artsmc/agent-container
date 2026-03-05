/**
 * GET /.well-known/jwks.json
 * JSON Web Key Set endpoint. Returns the public keys for token verification.
 */
import type { FastifyInstance } from 'fastify';
import { buildJwksResponse } from '../../signing-keys.js';

export function registerJwksRoute(app: FastifyInstance): void {
  app.get('/.well-known/jwks.json', async (_request, reply) => {
    const jwks = buildJwksResponse();
    return reply
      .status(200)
      .header('Cache-Control', 'public, max-age=3600')
      .send(jwks);
  });
}
