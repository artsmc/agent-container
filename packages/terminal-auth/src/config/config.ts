/**
 * Runtime configuration for the terminal-auth package.
 * All values resolve from environment variables with sensible iExcel platform defaults.
 */
export const config = {
  /** OIDC issuer URL. Override with AUTH_ISSUER_URL. */
  issuerUrl: process.env['AUTH_ISSUER_URL'] ?? 'https://auth.iexcel.app',

  /** OAuth2 client ID for the terminal CLI. Override with AUTH_CLIENT_ID. */
  clientId: process.env['AUTH_CLIENT_ID'] ?? 'iexcel-terminal',

  /**
   * Path to the token storage file.
   * Override with AUTH_TOKEN_PATH.
   * The leading ~ is resolved to os.homedir() at runtime by token-manager.
   */
  tokenPath:
    process.env['AUTH_TOKEN_PATH'] ?? '~/.iexcel/auth/tokens.json',

  /**
   * Seconds before access token expiry at which to proactively refresh.
   * Tokens expiring within this window are treated as already expired.
   */
  refreshBufferSeconds: 60,

  /** OAuth2 scopes requested during device flow. */
  scopes: ['openid', 'profile', 'email'],
} as const;
