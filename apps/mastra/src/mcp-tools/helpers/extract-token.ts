/**
 * Extracts the user Bearer token from the MCP tool execution context.
 *
 * In Mastra's MCP server, the `context.mcp.extra.authInfo` object contains
 * the validated token from the incoming HTTP request's Authorization header.
 * If no auth middleware is configured, we fall back to inspecting the
 * requestContext for a manually-injected token.
 *
 * @see Feature 21 — FR-10, FR-13
 */
import type { ToolExecutionContext } from '@mastra/core/tools';

/**
 * Extract the user's Bearer token from the MCP execution context.
 *
 * Returns the raw token string (without the "Bearer " prefix) or null
 * if no token is present.
 *
 * IMPORTANT: Never log the returned token value.
 */
export function extractToken(context: ToolExecutionContext): string | null {
  // Path 1: MCP protocol authInfo (populated by Mastra's HTTP transport)
  const authInfo = context.mcp?.extra?.authInfo;
  if (authInfo?.token) {
    return authInfo.token;
  }

  // Path 2: requestContext (populated by server middleware)
  if (context.requestContext) {
    const token = context.requestContext.get('userToken') as string | undefined;
    if (token) {
      return token;
    }

    // Check for raw Authorization header value
    const authHeader = context.requestContext.get('authorization') as string | undefined;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.slice(7);
    }
  }

  return null;
}
