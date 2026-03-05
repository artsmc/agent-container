# @iexcel/terminal-tools

Terminal MCP tools package for iExcel Automation. Provides formatters, input schemas, error handling, and auth bridge for connecting Claude Code and Claw to the Mastra MCP server.

## Prerequisites

1. **Feature 32 (terminal-auth)** — Complete device flow authentication:
   ```bash
   iexcel login
   ```
   This creates `~/.iexcel/auth/tokens.json` with your access and refresh tokens.

2. **Feature 21 (Mastra MCP server)** — The Mastra server must be running at `http://localhost:8081/mcp` (or the URL configured via `MASTRA_MCP_URL`).

3. **Feature 07+ (API)** — The iExcel API must be running (Mastra routes through it).

## Claude Code Setup

1. The `.mcp.json` file at the monorepo root registers the iExcel MCP server with Claude Code.

2. Set environment variables (optional — defaults are for local development):
   ```bash
   export MASTRA_MCP_URL="http://localhost:8081/mcp"
   ```

3. Open the project in Claude Code. The MCP server should appear automatically.

4. The proxy script at `packages/terminal-tools/bin/mcp-proxy.js`:
   - Reads your token via `getValidAccessToken()` from terminal-auth
   - Forwards all MCP JSON-RPC messages to the Mastra server with `Authorization: Bearer <token>`
   - Triggers the device flow if no valid session exists

## Claw Setup

Claw MCP support status is pending confirmation. Options:

- **If Claw supports MCP natively:** Configure it to connect to the same Mastra MCP URL with the proxy script for auth.
- **If REST only:** Use `@iexcel/api-client` directly with `createTerminalTokenProvider()` from this package to make REST API calls.

## Available MCP Tools

| Tool | Description |
|------|-------------|
| `get_agenda` | Retrieve current agenda for a client |
| `get_tasks` | List tasks for a client, optionally filtered by status |
| `trigger_intake` | Trigger Workflow A (transcript to draft tasks) |
| `trigger_agenda` | Trigger Workflow B (completed tasks to agenda) |
| `get_client_status` | Client cycle overview |
| `list_clients` | List all accessible clients |
| `edit_task` | Edit task fields by short ID |
| `reject_task` | Reject a task by short ID |
| `approve_tasks` | Approve one or more tasks by short ID |
| `get_transcript` | Retrieve a transcript for a client |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MASTRA_MCP_URL` | `http://localhost:8081/mcp` | Mastra MCP server URL |
| `API_BASE_URL` | `http://localhost:3000` | iExcel API base URL |
| `IEXCEL_AUTH_ISSUER_URL` | `https://auth.iexcel.com` | Auth issuer for token refresh |

## Troubleshooting

### Server unreachable
```
Cannot connect to the iExcel Mastra server. Ensure the server is running.
```
Verify the Mastra server is running: `curl http://localhost:8081/mcp`

### Token expired
```
Your session has expired. Please authenticate: run `iexcel login`.
```
Re-authenticate with the device flow: `iexcel login`

### No clients found
```
No clients found for your account. Contact your administrator.
```
Your user account may not have client access configured. Contact an admin.

## Development

```bash
# Run tests
cd packages/terminal-tools && node_modules/.bin/vitest --run

# Type check
npx nx type-check terminal-tools
```
