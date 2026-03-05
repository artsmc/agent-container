import type { FastifyRequest, FastifyReply } from 'fastify';

/**
 * Rate-limiting middleware stub.
 *
 * TODO: Implement rate limiting using @fastify/rate-limit or a
 * Redis-backed sliding window once the Redis infrastructure is
 * provisioned (Feature 02 / 36).
 *
 * For now this is a pass-through that does nothing.
 */
export function rateLimit() {
  return async function rateLimitHook(
    _request: FastifyRequest,
    _reply: FastifyReply
  ): Promise<void> {
    // No-op: rate limiting not yet implemented
  };
}
