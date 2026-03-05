/**
 * Environment variable loading and validation.
 * Exits the process with a clear error if any required variable is missing.
 */

export interface AuthConfig {
  /** Postgres connection string for iexcel_auth database */
  authDatabaseUrl: string;
  /** External IdP OAuth client ID */
  idpClientId: string;
  /** External IdP OAuth client secret */
  idpClientSecret: string;
  /** External IdP OIDC issuer URL (e.g. https://accounts.google.com) */
  idpIssuerUrl: string;
  /** PEM-encoded RSA private key for JWT signing */
  signingKeyPrivate: string;
  /** Previous signing key for rotation period (optional) */
  signingKeyPrivatePrevious: string | null;
  /** The auth service's own issuer URL */
  authIssuerUrl: string;
  /** Port to listen on */
  port: number;
  /** Comma-separated list of allowed CORS origins */
  corsAllowedOrigins: string[];
  /** Scope value that grants admin access */
  adminScope: string;
  /** Node environment */
  nodeEnv: string;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    console.error(`FATAL: Required environment variable ${name} is not set.`);
    process.exit(1);
  }
  return value.trim();
}

function optionalEnv(name: string, defaultValue: string): string {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    return defaultValue;
  }
  return value.trim();
}

export function loadConfig(): AuthConfig {
  const authDatabaseUrl = requireEnv('AUTH_DATABASE_URL');
  const idpClientId = requireEnv('IDP_CLIENT_ID');
  const idpClientSecret = requireEnv('IDP_CLIENT_SECRET');
  const idpIssuerUrl = requireEnv('IDP_ISSUER_URL');
  const signingKeyPrivate = requireEnv('SIGNING_KEY_PRIVATE');
  const authIssuerUrl = requireEnv('AUTH_ISSUER_URL');

  const signingKeyPrivatePreviousRaw = process.env['SIGNING_KEY_PRIVATE_PREVIOUS'];
  const signingKeyPrivatePrevious =
    signingKeyPrivatePreviousRaw && signingKeyPrivatePreviousRaw.trim() !== ''
      ? signingKeyPrivatePreviousRaw.trim()
      : null;

  const portStr = optionalEnv('PORT', '8090');
  const port = parseInt(portStr, 10);
  if (isNaN(port) || port <= 0 || port > 65535) {
    console.error(`FATAL: PORT must be a valid port number (1-65535), got: ${portStr}`);
    process.exit(1);
  }

  const corsRaw = optionalEnv('CORS_ALLOWED_ORIGINS', '');
  const corsAllowedOrigins = corsRaw
    ? corsRaw.split(',').map((o) => o.trim()).filter(Boolean)
    : [];

  const adminScope = optionalEnv('ADMIN_SCOPE', 'admin');
  const nodeEnv = optionalEnv('NODE_ENV', 'development');

  return {
    authDatabaseUrl,
    idpClientId,
    idpClientSecret,
    idpIssuerUrl,
    signingKeyPrivate,
    signingKeyPrivatePrevious,
    authIssuerUrl,
    port,
    corsAllowedOrigins,
    adminScope,
    nodeEnv,
  };
}
