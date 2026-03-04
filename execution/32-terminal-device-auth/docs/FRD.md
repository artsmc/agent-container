# FRD — Feature Requirement Document
# Feature 32: Terminal Device Auth

**Date:** 2026-03-03
**Phase:** Phase 7 — Terminal
**Status:** Pending

---

## 1. Overview

Feature 32 implements the authentication layer for the iExcel terminal client ecosystem. It provides a device authorization flow that allows CLI tools (Claude Code, Claw, and any future terminal client) to authenticate users against the iExcel Auth Service without requiring browser redirects or password input directly in the terminal.

This feature is the authentication backbone of the terminal layer. Without it, no terminal-based MCP tool calls can be made — every tool in Feature 33 depends on a valid access token that this feature provides and maintains.

---

## 2. Business Objectives

### 2.1 Primary Objective

Enable account managers and technical users to authenticate the iExcel terminal client once and have that authentication silently persist across all terminal sessions and all terminal tools on their machine.

### 2.2 Business Value

| Objective | Value |
|---|---|
| Frictionless CLI authentication | Users can log in to the iExcel terminal client without managing API keys, pasting tokens, or using a browser-centric workflow |
| Single shared credential store | Logging in from Claude Code automatically authenticates Claw and any future CLI tool — zero repeated authentication friction |
| Silent session maintenance | The 30-day refresh token means users authenticate once per month, not once per session |
| Consistent identity | The same `sub` claim used in the Web UI means terminal actions are attributed to the same user identity across all iExcel surfaces |
| Standards compliance | OAuth 2.0 Device Authorization Grant (RFC 8628) is the industry standard for CLI authentication — no custom auth protocols to maintain |

### 2.3 Strategic Context

Feature 32 sits in Phase 7 of the iExcel development roadmap — the terminal layer. The terminal layer enables account managers and developers to interact with the iExcel automation system without opening a browser. This is particularly valuable for:

- Developers running Claude Code who want to query agendas or trigger workflows inline in their AI session.
- Account managers using Claw to check client status during other tasks.
- Future terminal integrations that need the same identity infrastructure with no additional setup.

The feature is intentionally scoped to authentication mechanics only. It does not implement any business logic or MCP tool calls — those are Feature 33. Feature 32 is the prerequisite that makes Feature 33 possible.

---

## 3. Target Users

| User | Environment | Auth Use Case |
|---|---|---|
| **Account Manager** | Claude Code, Claw | Runs `login` command once; subsequent sessions authenticate silently via token refresh |
| **Developer / Admin** | Claude Code | Authenticates to access debugging and workflow tools; may manage multiple machines |
| **Any Terminal Tool User** | Any future CLI in `~/.iexcel` ecosystem | Benefits from shared token store without re-authentication |

---

## 4. User Problems Solved

### 4.1 Problem: CLI Authentication is Hostile Without Browser Redirects

The iExcel Auth Service uses OIDC with an external IdP (Google/Okta). Standard OAuth flows for web apps require browser redirects, which terminal clients cannot initiate. Without the Device Authorization Flow, there is no standards-compliant way to authenticate a CLI tool.

**Solution:** RFC 8628 Device Authorization Grant. The user visits a short URL in any browser, enters a human-readable code, and the terminal automatically receives tokens — no copy-pasting of long tokens, no API key management.

### 4.2 Problem: Every CLI Tool Would Need Separate Authentication

If Claude Code and Claw each maintained their own credential stores, users would need to log in twice (once per tool) and manage two separate sessions. Any future terminal tool would add a third login.

**Solution:** Shared token store at `~/.iexcel/auth/tokens.json`. All tools read from and write to the same file. Log in once from any tool; all tools immediately have a valid session.

### 4.3 Problem: Users Get Interrupted Mid-Session When Access Tokens Expire

Access tokens have a 1-hour TTL. Without silent refresh, users would be forced to re-authenticate every hour — an unacceptable interruption to a working CLI session.

**Solution:** Silent refresh using the stored refresh token. When the access token expires (or is about to expire), the client transparently refreshes it. The user only needs to re-authenticate when the refresh token itself expires (default: 30 days).

### 4.4 Problem: Unauthenticated MCP Tool Calls Should Trigger Login, Not Fail Silently

If a user runs an MCP tool call without having authenticated first, the tool should guide them through authentication rather than failing with a cryptic error.

**Solution:** Automatic login trigger. When a tool call is made without a valid token, the terminal initiates the device flow interactively before proceeding.

---

## 5. Success Metrics and KPIs

| Metric | Target | How Measured |
|---|---|---|
| Login command completion rate | > 95% of initiated device flows complete authentication | Log device flow initiations vs. successful token writes |
| Silent refresh success rate | > 99.9% of refresh attempts succeed without user intervention | Log refresh attempts vs. errors requiring re-authentication |
| Cross-tool token portability | 100% — logging in from Claude Code must make tokens available to Claw | Integration test: write tokens from one tool path, read from another |
| Login-to-first-tool-call latency | < 2 minutes from `iexcel login` invocation | User experience: time from command to authenticated state |
| File permission compliance | 100% of token files written with mode 0600 | Automated test: verify `stat` output on written file |
| Token store security | Zero plaintext secrets in logs or output | Security audit: log scanning for token patterns |

---

## 6. Business Constraints and Dependencies

### 6.1 Upstream Dependencies (Blockers)

| Feature | What It Provides |
|---|---|
| **Feature 05 — Auth Service** | The running `POST /device/authorize` and `POST /device/token` endpoints that the terminal client calls |
| **Feature 06 — Auth Client Package** | The `@iexcel/auth-client` library with `initiateDeviceFlow`, `pollDeviceToken`, `refreshAccessToken`, `saveTokens`, `loadTokens`, and `clearTokens` implementations |

Feature 32 is a **consumer** of the auth-client package, not an implementer of those primitives. All OIDC protocol logic lives in Feature 06. Feature 32 wraps those primitives into user-facing commands and hooks them into the terminal tool lifecycle.

### 6.2 What Feature 32 Blocks

| Feature | Why It Needs Feature 32 |
|---|---|
| **Feature 33 — Terminal MCP Tools** | Every MCP tool call must be authenticated. Feature 33 imports the token management functions from Feature 32 to ensure a valid access token is attached to each API request. |

### 6.3 Scope Boundaries

| In Scope | Out of Scope |
|---|---|
| Login command / device flow initiation | Auth service implementation (Feature 05) |
| User code and verification URL display | MCP tool implementations (Feature 33) |
| Device token polling loop | API client HTTP calls (Feature 22) |
| Token storage at `~/.iexcel/auth/tokens.json` | Web browser device verification page (Feature 05) |
| Token loading on startup | Token encryption at rest |
| Silent access token refresh | Windows-specific permission handling |
| Automatic login trigger on unauthenticated tool call | |
| Logout command | |
| File permission enforcement (0600) | |

---

## 7. Integration with Product Roadmap

Feature 32 enables the entire terminal layer:

```
Feature 05 (Auth Service)
    └── Feature 06 (Auth Client Package)
            └── Feature 32 (Terminal Device Auth)   ← This feature
                    └── Feature 33 (Terminal MCP Tools)
```

Once Feature 32 is complete, the terminal layer is unblocked from an authentication standpoint. All MCP tool calls in Feature 33 can be built with the assumption that `getValidAccessToken()` will return a valid token or throw a typed error that guides the user through login.

---

## 8. Open Questions

| Question | Impact | Status |
|---|---|---|
| Should the `iexcel-terminal` package be a standalone NPX-executable or a named import used by Claude Code / Claw directly? | Determines how the login command is invoked | Deferred to Feature 33 implementation |
| Should the logout command also call a server-side token revocation endpoint? | Would improve security but requires Feature 05 to expose a revocation endpoint | Not specified in auth-prd.md; log and clear locally for now |
| How should the terminal behave if `~/.iexcel/auth/tokens.json` has been modified externally (corrupted JSON)? | Must not crash; must treat as unauthenticated | Handled in FRS.md |
