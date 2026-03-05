/**
 * GET /device
 * Human-facing page where the user enters their user_code.
 * If a valid user_code is submitted, redirects to IdP for authentication.
 */
import { randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { lookupByUserCode } from '../../services/device.js';
import { fetchIdpDiscovery, buildIdpAuthorizationUrl } from '../../services/idp.js';
import type { AuthorizationRequestSession } from '../../types.js';

interface DeviceVerifyQuery {
  user_code?: string;
}

export function registerDeviceVerifyRoute(
  app: FastifyInstance,
  idpIssuerUrl: string,
  issuerUrl: string
): void {
  // GET /device -- render form or process user_code
  app.get<{ Querystring: DeviceVerifyQuery }>('/device', async (request, reply) => {
    const { user_code } = request.query;

    // If no user_code, show the form
    if (!user_code) {
      return reply
        .status(200)
        .header('Content-Type', 'text/html; charset=utf-8')
        .send(buildCodeEntryPage(''));
    }

    // Look up the device flow by user code
    const record = lookupByUserCode(user_code);
    if (!record) {
      return reply
        .status(200)
        .header('Content-Type', 'text/html; charset=utf-8')
        .send(buildCodeEntryPage(user_code, 'Invalid or expired code. Please try again.'));
    }

    if (record.status !== 'pending') {
      return reply
        .status(200)
        .header('Content-Type', 'text/html; charset=utf-8')
        .send(buildCodeEntryPage(user_code, 'This code has already been used.'));
    }

    // Store session for callback -- device flow variant
    const sessionNonce = randomBytes(16).toString('base64url');
    const session: AuthorizationRequestSession = {
      clientId: record.clientId,
      redirectUri: '', // No redirect URI for device flow
      responseType: 'code',
      scope: record.scope,
      state: '',
      codeChallenge: null,
      codeChallengeMethod: null,
      nonce: null,
      deviceCode: record.deviceCode,
      createdAt: Date.now(),
    };

    reply.setCookie('auth_session', JSON.stringify(session), {
      httpOnly: true,
      secure: process.env['NODE_ENV'] === 'production',
      sameSite: 'lax',
      maxAge: 300,
      path: '/',
    });

    reply.setCookie('idp_state', sessionNonce, {
      httpOnly: true,
      secure: process.env['NODE_ENV'] === 'production',
      sameSite: 'lax',
      maxAge: 300,
      path: '/',
    });

    // Redirect to IdP for authentication
    const idpDiscovery = await fetchIdpDiscovery(idpIssuerUrl);
    const idpAuthUrl = buildIdpAuthorizationUrl({
      authorizationEndpoint: idpDiscovery.authorization_endpoint,
      state: sessionNonce,
      nonce: randomBytes(16).toString('base64url'),
      scopes: ['openid', 'profile', 'email'],
    });

    return reply.redirect(302, idpAuthUrl);
  });

  // POST /device -- form submission
  app.post<{ Body: { user_code?: string } }>('/device', async (request, reply) => {
    const userCode = request.body.user_code;
    if (!userCode) {
      return reply
        .status(200)
        .header('Content-Type', 'text/html; charset=utf-8')
        .send(buildCodeEntryPage('', 'Please enter a code.'));
    }

    // Redirect to GET with code
    const baseUrl = issuerUrl.replace(/\/$/, '');
    return reply.redirect(302, `${baseUrl}/device?user_code=${encodeURIComponent(userCode)}`);
  });
}

function buildCodeEntryPage(prefillCode: string, errorMessage?: string): string {
  const errorHtml = errorMessage
    ? `<div class="error">${escapeHtml(errorMessage)}</div>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Device Authorization - iExcel</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background: #f5f5f5; }
    .container { text-align: center; padding: 2rem; background: white; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); max-width: 400px; width: 90%; }
    h1 { color: #333; margin-bottom: 0.5rem; }
    p { color: #666; margin-bottom: 1.5rem; }
    input[type="text"] { font-size: 1.5rem; text-align: center; letter-spacing: 0.3rem; padding: 0.75rem 1rem; border: 2px solid #ddd; border-radius: 6px; width: 80%; text-transform: uppercase; }
    input[type="text"]:focus { outline: none; border-color: #3b82f6; }
    button { margin-top: 1rem; padding: 0.75rem 2rem; font-size: 1rem; background: #3b82f6; color: white; border: none; border-radius: 6px; cursor: pointer; }
    button:hover { background: #2563eb; }
    .error { color: #ef4444; margin-bottom: 1rem; font-size: 0.9rem; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Device Authorization</h1>
    <p>Enter the code displayed on your terminal.</p>
    ${errorHtml}
    <form method="POST" action="/device">
      <input type="text" name="user_code" value="${escapeHtml(prefillCode)}" placeholder="XXXX-XXXX" maxlength="9" autocomplete="off" autofocus />
      <br />
      <button type="submit">Continue</button>
    </form>
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
