import { jwtVerify, errors as joseErrors } from 'jose';
import type { TokenValidatorConfig, TokenClaims } from '../types/index.js';
import { TokenValidationError } from '../types/index.js';
import { getDiscoveryDocument } from '../discovery/index.js';
import { JwksCache } from './jwks-cache.js';

const DEFAULT_CLOCK_SKEW_SECONDS = 60;
const DEFAULT_ALGORITHMS = ['RS256', 'ES256'];

export interface TokenValidator {
  /**
   * Validates a JWT access or ID token and returns its verified claims.
   *
   * @throws {TokenValidationError} when validation fails for any reason.
   */
  validateToken(jwt: string): Promise<TokenClaims>;
}

/**
 * Creates a stateful token validator that caches the JWKS key set.
 * Call once per application lifecycle and reuse the returned handle.
 */
export function createTokenValidator(config: TokenValidatorConfig): TokenValidator {
  const {
    issuerUrl,
    audience,
    clockSkewToleranceSeconds = DEFAULT_CLOCK_SKEW_SECONDS,
    algorithms = DEFAULT_ALGORITHMS,
    fetchImpl,
  } = config;

  const jwksCache = new JwksCache();

  async function validateToken(jwt: string): Promise<TokenClaims> {
    let jwksUri: string;
    try {
      const discovery = await getDiscoveryDocument(issuerUrl, { fetchImpl });
      jwksUri = discovery.jwks_uri;
    } catch (cause) {
      throw new TokenValidationError(
        `Failed to retrieve JWKS URI from discovery document for issuer ${issuerUrl}`,
        'unknown',
        cause
      );
    }

    const jwks = await jwksCache.getJwks(jwksUri);

    try {
      const { payload } = await jwtVerify(jwt, jwks, {
        issuer: issuerUrl,
        audience,
        algorithms,
        clockTolerance: clockSkewToleranceSeconds,
      });

      // Validate required claims are present
      if (
        typeof payload.iss !== 'string' ||
        typeof payload.sub !== 'string' ||
        typeof payload.iat !== 'number' ||
        typeof payload.exp !== 'number'
      ) {
        throw new TokenValidationError(
          'Token is missing required claims (iss, sub, iat, exp)',
          'invalid_claims'
        );
      }

      return payload as TokenClaims;
    } catch (error) {
      if (error instanceof TokenValidationError) {
        throw error;
      }

      if (error instanceof joseErrors.JWTExpired) {
        throw new TokenValidationError('Token has expired', 'expired', error);
      }

      if (error instanceof joseErrors.JWTClaimValidationFailed) {
        const claim = error.claim;
        if (claim === 'iss') {
          throw new TokenValidationError(
            `Token issuer validation failed`,
            'invalid_issuer',
            error
          );
        }
        if (claim === 'aud') {
          throw new TokenValidationError(
            `Token audience validation failed`,
            'invalid_audience',
            error
          );
        }
        throw new TokenValidationError(
          `Token claim validation failed: ${claim}`,
          'invalid_claims',
          error
        );
      }

      if (error instanceof joseErrors.JWSSignatureVerificationFailed) {
        throw new TokenValidationError(
          'Token signature verification failed',
          'invalid_signature',
          error
        );
      }

      if (
        error instanceof joseErrors.JWTInvalid ||
        error instanceof joseErrors.JWSInvalid ||
        error instanceof joseErrors.JWEInvalid
      ) {
        throw new TokenValidationError(
          'Token is malformed or cannot be parsed',
          'malformed',
          error
        );
      }

      throw new TokenValidationError(
        `Token validation failed: ${error instanceof Error ? error.message : String(error)}`,
        'unknown',
        error
      );
    }
  }

  return { validateToken };
}
