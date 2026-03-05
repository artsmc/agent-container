#!/usr/bin/env node

/**
 * MCP Proxy Script for Claude Code
 *
 * This script acts as a stdio-to-HTTP bridge that:
 * 1. Reads the user's access token via terminal-auth's getValidAccessToken()
 * 2. Proxies MCP JSON-RPC messages from stdin to the Mastra MCP server
 * 3. Adds the Authorization header to every outbound request
 * 4. Triggers the device authorization flow if no valid session exists
 *
 * Claude Code launches this as a "command"-type MCP server.
 * It communicates via JSON-RPC over stdio (stdin/stdout).
 *
 * Environment variables:
 *   MASTRA_MCP_URL — URL of the Mastra MCP server (default: http://localhost:8081/mcp)
 */

import { getValidAccessToken } from '@iexcel/terminal-auth';

const MASTRA_MCP_URL =
  process.env.MASTRA_MCP_URL || 'http://localhost:8081/mcp';

/**
 * Read a complete JSON-RPC message from a buffer.
 * Uses Content-Length header framing (LSP-style) if present,
 * otherwise reads line-delimited JSON.
 */
function parseMessages(buffer) {
  const messages = [];
  const lines = buffer.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    try {
      messages.push(JSON.parse(trimmed));
    } catch {
      // Incomplete message — skip
    }
  }
  return messages;
}

/**
 * Sends a JSON-RPC message to stdout for Claude Code to consume.
 */
function sendResponse(message) {
  const json = JSON.stringify(message);
  process.stdout.write(json + '\n');
}

/**
 * Sends a JSON-RPC error response.
 */
function sendError(id, code, message) {
  sendResponse({
    jsonrpc: '2.0',
    id,
    error: { code, message },
  });
}

/**
 * Forwards an MCP JSON-RPC request to the Mastra MCP server
 * with the user's Authorization header.
 */
async function forwardToMastra(request, token) {
  try {
    const response = await fetch(MASTRA_MCP_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      sendError(
        request.id ?? null,
        -32000,
        `Mastra server returned ${response.status}: ${response.statusText}`
      );
      return;
    }

    const result = await response.json();
    sendResponse(result);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Unknown error';

    if (message.includes('ECONNREFUSED') || message.includes('fetch failed')) {
      sendError(
        request.id ?? null,
        -32000,
        `Cannot connect to the iExcel Mastra server at ${MASTRA_MCP_URL}. Ensure the server is running.`
      );
    } else {
      sendError(request.id ?? null, -32000, `Proxy error: ${message}`);
    }
  }
}

/**
 * Main entry point. Reads stdin line-by-line, obtains a fresh token
 * for each request, and forwards to the Mastra MCP server.
 */
async function main() {
  // Verify we can obtain a token at startup (triggers device flow if needed)
  let token;
  try {
    token = await getValidAccessToken({ interactive: true });
  } catch (err) {
    process.stderr.write(
      `Authentication failed: ${err instanceof Error ? err.message : String(err)}\n`
    );
    process.stderr.write(
      'Run `iexcel login` to authenticate before starting the MCP proxy.\n'
    );
    process.exit(1);
  }

  process.stderr.write(
    `MCP proxy started. Forwarding to ${MASTRA_MCP_URL}\n`
  );

  let buffer = '';

  process.stdin.setEncoding('utf-8');
  process.stdin.on('data', async (chunk) => {
    buffer += chunk;
    const messages = parseMessages(buffer);
    buffer = '';

    for (const message of messages) {
      // Refresh token for each request to handle expiry
      try {
        token = await getValidAccessToken({ interactive: true });
      } catch {
        sendError(
          message.id ?? null,
          -32000,
          'Authentication expired. Run `iexcel login` to re-authenticate.'
        );
        continue;
      }

      await forwardToMastra(message, token);
    }
  });

  process.stdin.on('end', () => {
    process.exit(0);
  });
}

main().catch((err) => {
  process.stderr.write(`Fatal proxy error: ${err}\n`);
  process.exit(1);
});
