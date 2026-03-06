/**
 * POST /register — Local email/password user registration.
 */
import type { FastifyInstance } from 'fastify';
import { registerLocalUser } from '../services/local-auth.js';
import { AuthError } from '../errors.js';

interface RegisterBody {
  email?: string;
  password?: string;
  name?: string;
}

export function registerRegisterRoute(app: FastifyInstance): void {
  app.post<{ Body: RegisterBody }>(
    '/register',
    {
      config: {
        rateLimit: {
          max: 10,
          timeWindow: '1 minute',
        },
      },
    },
    async (request, reply) => {
      const { email, password, name } = request.body;

      if (!email || !password || !name) {
        return reply.status(400).send({
          error: 'invalid_request',
          error_description: 'email, password, and name are required.',
        });
      }

      // Basic email validation
      if (!email.includes('@') || !email.includes('.')) {
        return reply.status(400).send({
          error: 'invalid_request',
          error_description: 'Invalid email address.',
        });
      }

      try {
        await registerLocalUser({ email, password, name });
        return reply.status(201).send({ message: 'User registered successfully.' });
      } catch (err) {
        if (err instanceof AuthError) {
          return reply.status(err.statusCode).send(err.toJSON());
        }
        throw err;
      }
    }
  );
}
