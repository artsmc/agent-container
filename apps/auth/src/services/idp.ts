/**
 * External Identity Provider integration service.
 * Fetches IdP discovery document, builds authorization URL, exchanges codes.
 */
import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { IdpClaims, IdpDiscoveryDocument } from '../types.js';

let cachedDiscovery: IdpDiscoveryDocument | null = null;
let discoveryFetchedAt: number = 0;
const DISCOVERY_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

let idpConfig: {
  issuerUrl: string;
  clientId: string;
  clientSecret: string;
  callbackUrl: string;
} | null = null;

export function initIdpService(config: {
  issuerUrl: string;
  clientId: string;
  clientSecret: string;
  callbackUrl: string;
}): void {
  idpConfig = config;
}

function getIdpConfig() {
  if (!idpConfig) {
    throw new Error('IdP service not initialized. Call initIdpService() first.');
  }
  return idpConfig;
}

export async function fetchIdpDiscovery(
  issuerUrl: string
): Promise<IdpDiscoveryDocument> {
  const now = Date.now();
  if (cachedDiscovery && now - discoveryFetchedAt < DISCOVERY_CACHE_TTL_MS) {
    return cachedDiscovery;
  }

  const discoveryUrl = `${issuerUrl.replace(/\/$/, '')}/.well-known/openid-configuration`;
  const response = await fetch(discoveryUrl);

  if (!response.ok) {
    throw new Error(
      `Failed to fetch IdP discovery document from ${discoveryUrl}: ${response.status} ${response.statusText}`
    );
  }

  const doc = (await response.json()) as IdpDiscoveryDocument;
  cachedDiscovery = doc;
  discoveryFetchedAt = now;
  return doc;
}

export function buildIdpAuthorizationUrl(params: {
  authorizationEndpoint: string;
  state: string;
  nonce: string;
  scopes: string[];
}): string {
  const config = getIdpConfig();
  const url = new URL(params.authorizationEndpoint);
  url.searchParams.set('client_id', config.clientId);
  url.searchParams.set('redirect_uri', config.callbackUrl);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', params.scopes.join(' '));
  url.searchParams.set('state', params.state);
  url.searchParams.set('nonce', params.nonce);
  return url.toString();
}

export async function exchangeIdpCode(
  code: string,
  tokenEndpoint: string,
  jwksUri: string,
  issuer: string
): Promise<IdpClaims> {
  const config = getIdpConfig();

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: config.callbackUrl,
    client_id: config.clientId,
    client_secret: config.clientSecret,
  });

  const response = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`IdP token exchange failed: ${response.status} - ${errorBody}`);
  }

  const tokenResponse = (await response.json()) as {
    id_token: string;
    access_token: string;
  };

  // Verify IdP's ID token
  const JWKS = createRemoteJWKSet(new URL(jwksUri));
  const { payload } = await jwtVerify(tokenResponse.id_token, JWKS, {
    issuer,
  });

  const sub = payload.sub;
  if (!sub) {
    throw new Error('IdP ID token missing sub claim.');
  }

  // Extract the IdP provider from the issuer URL
  const idpProvider = extractProviderName(issuer);

  return {
    sub,
    email: (payload.email as string) ?? '',
    name: (payload.name as string) ?? '',
    picture: (payload.picture as string) ?? null,
    idpProvider,
  };
}

function extractProviderName(issuerUrl: string): string {
  try {
    const url = new URL(issuerUrl);
    // e.g. accounts.google.com -> google, login.microsoftonline.com -> microsoft
    const host = url.hostname;
    if (host.includes('google')) return 'google';
    if (host.includes('microsoft') || host.includes('azure')) return 'microsoft';
    if (host.includes('okta')) return 'okta';
    if (host.includes('auth0')) return 'auth0';
    return host;
  } catch {
    return 'unknown';
  }
}
