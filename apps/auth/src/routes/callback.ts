/**
 * GET /callback
 * Receives the authorization code from the external IdP after user authentication.
 * Completes the server-side code exchange, upserts user, and issues an auth code.
 */
import type { FastifyInstance } from 'fastify';
import { exchangeIdpCode, fetchIdpDiscovery } from '../services/idp.js';
import { upsertUserFromIdpClaims, assertUserIsActive } from '../services/user.js';
import { createSession } from '../services/session.js';
import { createAuthCode } from '../services/auth-codes.js';
import { resolveDeviceFlow } from '../services/device.js';
import type { AuthorizationRequestSession } from '../types.js';

interface CallbackQuery {
  code?: string;
  state?: string;
  error?: string;
  error_description?: string;
}

export function registerCallbackRoute(
  app: FastifyInstance,
  idpIssuerUrl: string
): void {
  app.get<{ Querystring: CallbackQuery }>('/callback', async (request, reply) => {
    const { code, state, error, error_description } = request.query;

    // Retrieve stored session from cookie
    const sessionCookie = request.cookies['auth_session'];
    if (!sessionCookie) {
      return reply.status(400).send({
        error: 'invalid_request',
        error_description: 'No authorization session found. Please try again.',
      });
    }

    let session: AuthorizationRequestSession;
    try {
      session = JSON.parse(sessionCookie) as AuthorizationRequestSession;
    } catch {
      return reply.status(400).send({
        error: 'invalid_request',
        error_description: 'Invalid authorization session.',
      });
    }

    // Clear the session cookies
    reply.clearCookie('auth_session', { path: '/' });
    reply.clearCookie('idp_state', { path: '/' });

    // Check session TTL (5 minutes)
    if (Date.now() - session.createdAt > 5 * 60 * 1000) {
      return redirectWithSessionError(reply, session, 'invalid_request', 'Authorization session expired.');
    }

    // Validate IdP state matches
    const idpStateCookie = request.cookies['idp_state'];
    if (!idpStateCookie || idpStateCookie !== state) {
      return redirectWithSessionError(reply, session, 'invalid_request', 'State mismatch. Possible CSRF attack.');
    }

    // Handle IdP errors
    if (error) {
      return redirectWithSessionError(
        reply,
        session,
        error,
        error_description ?? 'Authentication failed at the identity provider.'
      );
    }

    if (!code) {
      return redirectWithSessionError(reply, session, 'invalid_request', 'Missing authorization code from IdP.');
    }

    try {
      // Exchange IdP code for tokens
      const idpDiscovery = await fetchIdpDiscovery(idpIssuerUrl);
      const claims = await exchangeIdpCode(
        code,
        idpDiscovery.token_endpoint,
        idpDiscovery.jwks_uri,
        idpDiscovery.issuer
      );

      // Upsert user
      const user = await upsertUserFromIdpClaims(claims);

      // Check if user is active
      assertUserIsActive(user);

      // Create session
      await createSession({
        userId: user.id,
        idpSessionId: null,
      });

      // Handle device flow completion
      if (session.deviceCode) {
        resolveDeviceFlow(session.deviceCode, user.id);

        // Return a success page for device flow
        return reply
          .status(200)
          .header('Content-Type', 'text/html; charset=utf-8')
          .send(buildDeviceSuccessPage());
      }

      // Generate authorization code for the client
      const authCode = createAuthCode({
        userId: user.id,
        clientId: session.clientId,
        redirectUri: session.redirectUri,
        codeChallenge: session.codeChallenge,
        codeChallengeMethod: session.codeChallengeMethod,
        scope: session.scope,
        nonce: session.nonce,
      });

      // Redirect back to client with auth code
      const redirectUrl = new URL(session.redirectUri);
      redirectUrl.searchParams.set('code', authCode);
      redirectUrl.searchParams.set('state', session.state);
      return reply.redirect(302, redirectUrl.toString());
    } catch (err) {
      console.error('Callback error:', err instanceof Error ? err.message : String(err));

      if (session.deviceCode) {
        const message =
          err instanceof Error && err.message.includes('deactivated')
            ? 'Your account has been deactivated.'
            : 'Authentication failed. Please try again.';
        return reply
          .status(200)
          .header('Content-Type', 'text/html; charset=utf-8')
          .send(buildDeviceErrorPage(message));
      }

      const errorMsg =
        err instanceof Error && err.message.includes('deactivated')
          ? 'access_denied'
          : 'server_error';
      const errorDesc =
        err instanceof Error ? err.message : 'An unexpected error occurred.';
      return redirectWithSessionError(reply, session, errorMsg, errorDesc);
    }
  });
}

function redirectWithSessionError(
  reply: { redirect: (code: number, url: string) => unknown },
  session: AuthorizationRequestSession,
  error: string,
  description: string
) {
  const url = new URL(session.redirectUri);
  url.searchParams.set('error', error);
  url.searchParams.set('error_description', description);
  url.searchParams.set('state', session.state);
  return reply.redirect(302, url.toString());
}

function buildDeviceSuccessPage(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Authentication Complete</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background: #f5f5f5; }
    .container { text-align: center; padding: 2rem; background: white; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); max-width: 400px; }
    h1 { color: #22c55e; }
    p { color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Authentication Complete</h1>
    <p>You have been authenticated. You may close this tab.</p>
  </div>
</body>
</html>`;
}

function buildDeviceErrorPage(message: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Authentication Error</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background: #f5f5f5; }
    .container { text-align: center; padding: 2rem; background: white; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); max-width: 400px; }
    h1 { color: #ef4444; }
    p { color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Authentication Error</h1>
    <p>${escapeHtml(message)}</p>
  </div>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
