/**
 * GET /health
 * Health check endpoint for load balancer and deployment pipeline.
 * Returns 200 if database is reachable, 503 if not.
 */
import type { FastifyInstance } from 'fastify';
import { getPool } from '../db/index.js';

export function registerHealthRoute(app: FastifyInstance): void {
  app.get('/health', async (_request, reply) => {
    try {
      const pool = getPool();
      await pool.query('SELECT 1');

      return reply.status(200).send({
        status: 'ok',
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      console.error(
        'Health check failed:',
        err instanceof Error ? err.message : String(err)
      );
      return reply.status(503).send({
        status: 'degraded',
        reason: 'database_unreachable',
        timestamp: new Date().toISOString(),
      });
    }
  });
}
