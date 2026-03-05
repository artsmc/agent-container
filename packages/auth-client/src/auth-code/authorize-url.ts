import type { AuthCodeConfig } from '../types/index.js';
import { getDiscoveryDocument } from '../discovery/index.js';

/**
 * Builds the authorization URL to redirect the user to for PKCE login.
 *
 * @param config - Auth code flow configuration.
 * @param state - Opaque state value for CSRF protection; must be stored
 *   client-side and verified in the callback.
 * @param codeVerifier - The PKCE code verifier from generatePkceChallenge();
 *   the corresponding codeChallenge is derived and included in the URL.
 * @returns The full authorization URL string to redirect to.
 */
export async function buildAuthorizeUrl(
  config: AuthCodeConfig,
  state: string,
  codeChallenge: string
): Promise<string> {
  const {
    issuerUrl,
    clientId,
    redirectUri,
    scope = 'openid profile email',
    fetchImpl,
  } = config;

  const discovery = await getDiscoveryDocument(issuerUrl, { fetchImpl });

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });

  return `${discovery.authorization_endpoint}?${params.toString()}`;
}
