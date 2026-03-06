/**
 * GET /authorize
 * OIDC authorization endpoint. Validates params and redirects to the login page.
 * The user chooses local auth or external IdP (Google) on the login page.
 */
import type { FastifyInstance } from 'fastify';
import { lookupClient, assertClientSupportsGrant } from '../services/client.js';
import type { AuthorizationRequestSession } from '../types.js';
import { AuthError } from '../errors.js';

interface AuthorizeQuery {
  client_id?: string;
  redirect_uri?: string;
  response_type?: string;
  scope?: string;
  state?: string;
  code_challenge?: string;
  code_challenge_method?: string;
  nonce?: string;
}

export function registerAuthorizeRoute(
  app: FastifyInstance,
  _idpIssuerUrl: string
): void {
  app.get<{ Querystring: AuthorizeQuery }>('/authorize', async (request, reply) => {
    const {
      client_id,
      redirect_uri,
      response_type,
      scope,
      state,
      code_challenge,
      code_challenge_method,
      nonce,
    } = request.query;

    // Validate required parameters exist
    if (!client_id) {
      return reply.status(400).send({
        error: 'invalid_request',
        error_description: 'Missing required parameter: client_id',
      });
    }

    if (!redirect_uri) {
      return reply.status(400).send({
        error: 'invalid_request',
        error_description: 'Missing required parameter: redirect_uri',
      });
    }

    if (!state) {
      return reply.status(400).send({
        error: 'invalid_request',
        error_description: 'Missing required parameter: state',
      });
    }

    // Look up client
    let client;
    try {
      client = await lookupClient(client_id);
    } catch (err) {
      return redirectWithError(reply, redirect_uri, 'unauthorized_client', 'Client not found or inactive.', state);
    }

    // Validate redirect_uri -- exact match
    if (!client.redirect_uris.includes(redirect_uri)) {
      // Do NOT redirect -- redirect_uri itself is untrusted
      return reply.status(400).send({
        error: 'invalid_request',
        error_description: 'redirect_uri does not match any registered URIs for this client.',
      });
    }

    // Validate response_type
    if (response_type !== 'code') {
      return redirectWithError(reply, redirect_uri, 'unsupported_response_type', 'Only response_type=code is supported.', state);
    }

    // Validate scope
    if (!scope) {
      return redirectWithError(reply, redirect_uri, 'invalid_scope', 'Missing required parameter: scope', state);
    }

    const requestedScopes = scope.split(' ');
    if (!requestedScopes.includes('openid')) {
      return redirectWithError(reply, redirect_uri, 'invalid_scope', 'scope must include openid.', state);
    }

    for (const s of requestedScopes) {
      if (!client.scopes.includes(s)) {
        return redirectWithError(reply, redirect_uri, 'invalid_scope', `Scope '${s}' is not allowed for this client.`, state);
      }
    }

    // Validate grant type
    try {
      assertClientSupportsGrant(client, 'authorization_code');
    } catch (err) {
      const errMsg = err instanceof AuthError ? err.message : 'Client not authorized for this grant type.';
      return redirectWithError(reply, redirect_uri, 'unauthorized_client', errMsg, state);
    }

    // PKCE enforcement for public clients
    if (client.client_type === 'public' && !code_challenge) {
      return redirectWithError(reply, redirect_uri, 'invalid_request', 'PKCE (code_challenge) is required for public clients.', state);
    }

    if (code_challenge && code_challenge_method !== 'S256') {
      return redirectWithError(reply, redirect_uri, 'invalid_request', 'Only code_challenge_method=S256 is supported.', state);
    }

    // Store authorization request in a cookie for the login page
    const session: AuthorizationRequestSession = {
      clientId: client_id,
      redirectUri: redirect_uri,
      responseType: response_type,
      scope,
      state,
      codeChallenge: code_challenge ?? null,
      codeChallengeMethod: code_challenge_method ?? null,
      nonce: nonce ?? null,
      deviceCode: null,
      createdAt: Date.now(),
    };

    // Set session in a short-lived, httponly cookie
    reply.setCookie('auth_session', JSON.stringify(session), {
      httpOnly: true,
      secure: process.env['NODE_ENV'] === 'production',
      sameSite: 'lax',
      maxAge: 300, // 5 minutes
      path: '/',
    });

    // Redirect to the auth service's own login page.
    // The login page will let the user choose local auth or external IdP (Google).
    return reply.redirect(302, '/login');
  });
}

import type { FastifyReply } from 'fastify';

function redirectWithError(
  reply: FastifyReply,
  redirectUri: string,
  error: string,
  description: string,
  state: string
) {
  const url = new URL(redirectUri);
  url.searchParams.set('error', error);
  url.searchParams.set('error_description', description);
  url.searchParams.set('state', state);
  return reply.redirect(302, url.toString());
}
