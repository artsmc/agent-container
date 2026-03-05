/**
 * GET /.well-known/openid-configuration
 * OIDC discovery document endpoint.
 */
import type { FastifyInstance } from 'fastify';
import type { OIDCDiscoveryDocument } from '../../types.js';

export function registerDiscoveryRoute(
  app: FastifyInstance,
  issuerUrl: string
): void {
  app.get('/.well-known/openid-configuration', async (_request, reply) => {
    const baseUrl = issuerUrl.replace(/\/$/, '');

    const discovery: OIDCDiscoveryDocument = {
      issuer: baseUrl,
      authorization_endpoint: `${baseUrl}/authorize`,
      token_endpoint: `${baseUrl}/token`,
      device_authorization_endpoint: `${baseUrl}/device/authorize`,
      userinfo_endpoint: `${baseUrl}/userinfo`,
      jwks_uri: `${baseUrl}/.well-known/jwks.json`,
      response_types_supported: ['code'],
      grant_types_supported: [
        'authorization_code',
        'refresh_token',
        'urn:ietf:params:oauth:grant-type:device_code',
        'client_credentials',
      ],
      subject_types_supported: ['public'],
      id_token_signing_alg_values_supported: ['RS256'],
      scopes_supported: ['openid', 'profile', 'email'],
      token_endpoint_auth_methods_supported: ['client_secret_post', 'none'],
      claims_supported: [
        'sub',
        'iss',
        'aud',
        'exp',
        'iat',
        'email',
        'name',
        'picture',
      ],
    };

    return reply.status(200).send(discovery);
  });
}
