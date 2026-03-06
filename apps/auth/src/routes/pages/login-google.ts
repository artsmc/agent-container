/**
 * GET /login/google — Redirects to Google OAuth.
 * Reads the auth_session cookie (set by /authorize) and builds the Google auth URL.
 * If no auth_session exists (direct admin login), creates a minimal one first.
 */
import { randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { fetchIdpDiscovery, buildIdpAuthorizationUrl } from '../../services/idp.js';

export function registerGoogleLoginRoute(
  app: FastifyInstance,
  idpIssuerUrl: string
): void {
  app.get('/login/google', async (request, reply) => {
    // Verify auth_session cookie exists (set by /authorize)
    const sessionCookie = request.cookies['auth_session'];
    if (!sessionCookie) {
      return reply.status(400).send({
        error: 'invalid_request',
        error_description: 'No authorization session found. Start from the application login.',
      });
    }

    // Build Google auth URL
    const sessionNonce = randomBytes(16).toString('base64url');
    const idpDiscovery = await fetchIdpDiscovery(idpIssuerUrl);
    const idpAuthUrl = buildIdpAuthorizationUrl({
      authorizationEndpoint: idpDiscovery.authorization_endpoint,
      state: sessionNonce,
      nonce: randomBytes(16).toString('base64url'),
      scopes: ['openid', 'profile', 'email'],
    });

    // Store the nonce for callback verification
    reply.setCookie('idp_state', sessionNonce, {
      httpOnly: true,
      secure: process.env['NODE_ENV'] === 'production',
      sameSite: 'lax',
      maxAge: 300,
      path: '/',
    });

    return reply.redirect(302, idpAuthUrl);
  });
}
