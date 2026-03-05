/**
 * Environment configuration for terminal tools.
 *
 * Loads and validates required environment variables for MCP server
 * connectivity, API access, and auth issuer discovery.
 */

export interface TerminalToolsEnv {
  /** URL of the Mastra MCP server. e.g., "http://localhost:8081/mcp" */
  MASTRA_MCP_URL: string;
  /** Base URL of the iExcel API. e.g., "http://localhost:3000" */
  API_BASE_URL: string;
  /** Auth issuer URL for token refresh. e.g., "https://auth.iexcel.com" */
  IEXCEL_AUTH_ISSUER_URL: string;
}

const DEFAULTS: Record<string, string> = {
  MASTRA_MCP_URL: 'http://localhost:8081/mcp',
  API_BASE_URL: 'http://localhost:3000',
  IEXCEL_AUTH_ISSUER_URL: 'https://auth.iexcel.com',
};

function loadEnv(): TerminalToolsEnv {
  const MASTRA_MCP_URL =
    process.env['MASTRA_MCP_URL'] ?? DEFAULTS['MASTRA_MCP_URL']!;
  const API_BASE_URL =
    process.env['API_BASE_URL'] ?? DEFAULTS['API_BASE_URL']!;
  const IEXCEL_AUTH_ISSUER_URL =
    process.env['IEXCEL_AUTH_ISSUER_URL'] ?? DEFAULTS['IEXCEL_AUTH_ISSUER_URL']!;

  return { MASTRA_MCP_URL, API_BASE_URL, IEXCEL_AUTH_ISSUER_URL };
}

/** Validated environment configuration. */
export const env: TerminalToolsEnv = loadEnv();
