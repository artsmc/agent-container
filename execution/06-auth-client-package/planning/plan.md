# Refined Execution Plan
# Feature 06: Auth Client Package

**Package**: `packages/auth-client/`
**Phase**: 1 — Foundation
**Agent**: Single `nextjs-backend-developer`
**Status**: Approved

---

## Planning Notes

### Changes from Original Task List
1. **Reorganized from 11 phases (A-K) into 5 waves** for clearer parallelism
2. **Overlapped types with scaffolding** — types don't need the build to pass
3. **Grouped all independent feature modules into one parallel wave** — D through I are all independent once Discovery (C) is complete
4. **Total tasks: 37 (unchanged)** — No missing tasks or dead tasks found

### Resolved Technical Questions (from TR.md Section 17)
- **jose v5 PKCE utilities**: jose v5 does NOT provide built-in PKCE generation. Manual Web Crypto implementation needed in pkce.ts.
- **Auth service signing algorithm**: RS256 (RSA 2048) — confirmed from Feature 05 TR.md
- **Refresh token rotation**: YES, implemented — confirmed from Feature 05 FRS.md Section 2.5.2. The refresh module must surface the rotated token.
- **shared-types overlap**: Define types locally; refactor if Feature 01 has overlapping types
- **Windows support**: Target macOS/Linux. File permissions (0600) apply to Unix-like systems.

---

## Wave 1 — Scaffolding + Types (partially parallel)

Sequential first (directory must exist before types):

- [ ] **A1** Scaffold `packages/auth-client/` via Nx library generator
  - Complexity: Small
  - Reference: TR.md Section 1, 4

- [ ] **A2** Configure `package.json` with subpath exports (./types, ./discovery, ./validation, ./refresh, ./auth-code, ./device-flow, ./client-credentials, ./token-storage)
  - Complexity: Small
  - Reference: TR.md Section 4.2

- [ ] **A3** Configure `tsconfig.json` with strict, ESNext, bundler resolution, shared-types reference
  - Complexity: Small
  - Reference: TR.md Section 5

- [ ] **A4** Configure `project.json` with build/lint/test targets, tags: scope:shared, type:library
  - Complexity: Small
  - Reference: TR.md Section 4.1

- [ ] **A5** Configure `vite.config.ts` for vitest with coverage >= 90%
  - Complexity: Small
  - Reference: TR.md Section 12

- [ ] **A6** Install `jose@^5.0.0` as sole runtime dependency
  - Complexity: Small
  - Reference: TR.md Section 2.1

Then parallel:

- [ ] **A7** Verify Nx build passes on empty scaffold
  - Complexity: Small

- [ ] **B1** Create `types/errors.ts` — full error hierarchy (AuthClientError base, DiscoveryError, TokenValidationError, AuthCallbackError, DeviceFlowError, TokenRefreshError, ClientCredentialsError, TokenStorageError)
  - Complexity: Small
  - Reference: FRS.md Section 9, TR.md Section 6

- [ ] **B2** Create `types/tokens.ts` — TokenSet, StoredTokens, TokenClaims interfaces
  - Complexity: Small
  - Reference: FRS.md Section 3.2, 8.2, TR.md Section 6

- [ ] **B3** Create `types/discovery.ts` — OidcDiscoveryDocument, DiscoveryOptions interfaces
  - Complexity: Small
  - Reference: FRS.md Section 2.2

- [ ] **B4** Create `types/flows.ts` — all flow config interfaces (TokenValidatorConfig, RefreshConfig, AuthCodeConfig, DeviceFlowConfig, ClientCredentialsConfig, StorageOptions, etc.)
  - Complexity: Small
  - Reference: FRS.md Sections 3.2-8.2

Then:

- [ ] **B5** Create `types/index.ts` re-exporting all types + unit tests verifying error hierarchy
  - Complexity: Small
  - Reference: FRS.md Section 9, GS.md Error Handling

---

## Wave 2 — Discovery Module (sequential)

All other modules depend on Discovery for endpoint resolution.

- [ ] **C1** Implement `discovery/discovery-client.ts` — getDiscoveryDocument(issuerUrl, options), fetch + parse + validate required fields, in-process cache with TTL
  - Complexity: Medium
  - Reference: FRS.md Section 2, GS.md OIDC Discovery

- [ ] **C2** Implement TTL-based cache invalidation — per-issuerUrl map, configurable cacheTtlMs, throw DiscoveryError on failure
  - Complexity: Small
  - Reference: FRS.md FR-DISC-02, FR-DISC-05

- [ ] **C3** Write discovery unit tests — first-fetch, cache hit, cache miss after TTL, HTTP 503 error, malformed JSON
  - Complexity: Small
  - Reference: GS.md OIDC Discovery

- [ ] **C4** Export from `discovery/index.ts`, verify subpath import resolves
  - Complexity: Small

---

## Wave 3 — Feature Modules (PARALLEL)

All 6 groups are independent of each other. They only depend on Wave 1 (types) and Wave 2 (discovery).

### Group D: Token Validation

- [ ] **D1** Implement `validation/jwks-cache.ts` — JWKS cache with TTL-based refresh, forced refresh on kid-not-found, in-flight deduplication
  - Complexity: Large
  - Reference: FRS.md Section 3, TR.md Section 7, GS.md key rotation

- [ ] **D2** Implement `validation/token-validator.ts` — createTokenValidator(config) → TokenValidator with validateToken(jwt). Uses jose jwtVerify + JWKS cache. Maps jose errors to TokenValidationError hierarchy.
  - Complexity: Medium
  - Reference: FRS.md FR-VAL-01 through FR-VAL-10, TR.md Section 7

- [ ] **D3** Write validation unit tests — valid token, expired, wrong issuer, wrong audience, tampered signature, malformed, kid-not-found + refresh, JWKS unavailable, clock skew tolerance
  - Complexity: Large
  - Reference: GS.md Token Validation

- [ ] **D4** Export from `validation/index.ts`
  - Complexity: Small

### Group E: Token Refresh

- [ ] **E1** Implement `refresh/token-refresh.ts` — refreshAccessToken(config, refreshToken). POST to token_endpoint with grant_type=refresh_token. Handle rotated refresh token. Map errors to TokenRefreshError.
  - Complexity: Medium
  - Reference: FRS.md Section 4

- [ ] **E2** Write refresh unit tests — successful with/without rotation, expired token, network failure
  - Complexity: Small
  - Reference: GS.md Token Refresh

- [ ] **E3** Export from `refresh/index.ts`
  - Complexity: Small

### Group F: Authorization Code Flow (PKCE)

- [ ] **F1** Implement `auth-code/pkce.ts` — generatePkceChallenge() using Web Crypto (32 random bytes, SHA-256, base64url)
  - Complexity: Small
  - Reference: FRS.md FR-AUTH-03, FR-AUTH-04, TR.md Section 10

- [ ] **F2** Implement `auth-code/authorize-url.ts` — buildAuthorizeUrl(config, state, codeVerifier). Uses discovery for authorization_endpoint. Constructs URL with response_type=code, PKCE params.
  - Complexity: Small
  - Reference: FRS.md FR-AUTH-01, FR-AUTH-02

- [ ] **F3** Implement `auth-code/callback-handler.ts` — exchangeCodeForTokens(config, callbackUrl, state, codeVerifier). Parse callback, validate state, handle error param, POST to token_endpoint.
  - Complexity: Medium
  - Reference: FRS.md FR-AUTH-05 through FR-AUTH-07

- [ ] **F4** Write auth code unit tests — PKCE correctness (SHA-256 verify), URL structure, code exchange success, state mismatch, provider error, missing code
  - Complexity: Medium
  - Reference: GS.md Authorization Code Flow

- [ ] **F5** Export from `auth-code/index.ts`
  - Complexity: Small

### Group G: Device Flow

- [ ] **G1** Implement `device-flow/initiate.ts` — initiateDeviceFlow(config). POST to device_authorization_endpoint. Return DeviceAuthorizationResponse.
  - Complexity: Small
  - Reference: FRS.md FR-DEV-01, FR-DEV-02

- [ ] **G2** Implement `device-flow/poller.ts` — pollDeviceToken(config, deviceCode, interval, expiresIn, options?). RFC 8628 Section 3.5 polling loop: initial wait, authorization_pending continue, slow_down +5s, expired_token throw, access_denied throw, timeout throw, success return. onPrompt callback.
  - Complexity: Large
  - Reference: FRS.md FR-DEV-03 through FR-DEV-11, TR.md Section 8, GS.md Device Flow

- [ ] **G3** Write device flow unit tests — poll success on 3rd attempt, slow_down increases interval, double slow_down accumulates, expired_token, access_denied, timeout, onPrompt callback
  - Complexity: Large
  - Reference: GS.md Device Authorization Flow

- [ ] **G4** Export from `device-flow/index.ts`
  - Complexity: Small

### Group H: Client Credentials

- [ ] **H1** Implement `client-credentials/client.ts` — createClientCredentialsClient(config). Returns {getAccessToken(), forceRefresh()}. In-memory cache with expiry-buffer. In-flight deduplication for concurrent calls.
  - Complexity: Large
  - Reference: FRS.md Section 7, TR.md Section 7, GS.md Client Credentials

- [ ] **H2** Write client credentials unit tests — initial fetch, cache hit, auto-refresh in buffer, concurrent dedup, forceRefresh bypasses cache, invalid_client error
  - Complexity: Medium
  - Reference: GS.md Client Credentials Flow

- [ ] **H3** Export from `client-credentials/index.ts`
  - Complexity: Small

### Group I: Token Storage

- [ ] **I1** Implement `token-storage/file-store.ts` — saveTokens, loadTokens, clearTokens. Default path: ~/.iexcel/auth/tokens.json. Create dir with 0o700, write file with 0o600. Return null for missing/malformed files.
  - Complexity: Medium
  - Reference: FRS.md Section 8, TR.md Section 9, GS.md Token Storage

- [ ] **I2** Write token storage unit tests (temp dir) — save/load round-trip, directory creation, file permissions 0600, missing file null, malformed JSON null, clearTokens deletes, load after clear null
  - Complexity: Medium
  - Reference: GS.md Token Storage

- [ ] **I3** Export from `token-storage/index.ts`
  - Complexity: Small

---

## Wave 4 — Integration (sequential)

- [ ] **J1** Create `src/index.ts` root barrel re-exporting all public API. Ensure tree-shaking works.
  - Complexity: Small

- [ ] **J2** Run `nx test auth-client --coverage` — all tests pass, >= 90% coverage
  - Complexity: Small

- [ ] **J3** Run `nx build auth-client` — TypeScript compiles clean, no `any` leakage
  - Complexity: Small

- [ ] **J4** Run `nx lint auth-client` — zero lint errors
  - Complexity: Small

- [ ] **J5** Run `nx graph` — verify api, ui, mastra appear as dependents
  - Complexity: Small

- [ ] **J6** Integration smoke test — generate RSA key pair in test, sign JWT, verify via createTokenValidator, confirm full pipeline
  - Complexity: Medium

---

## Wave 5 — Documentation

- [ ] **K1** Add TSDoc comments to all exported functions and interfaces
  - Complexity: Medium

- [ ] **K2** Create `packages/auth-client/README.md` — purpose, consumer guide, config reference, error handling
  - Complexity: Small

- [ ] **K3** Update memory bank with auth-client patterns (subpath exports, fetchImpl injection, JWKS cache architecture)
  - Complexity: Small

---

## Completion Checklist

- [ ] All 8 subpath exports resolve correctly
- [ ] Token validation: JWKS cache with TTL + force-refresh + dedup
- [ ] Token refresh: handles rotation, surfaces new refresh token
- [ ] Auth code flow: PKCE generation, URL building, callback handling
- [ ] Device flow: RFC 8628 compliant polling with slow_down + timeout
- [ ] Client credentials: cached token with expiry buffer + concurrent dedup
- [ ] Token storage: file permissions 0600, directory auto-create, null on missing/malformed
- [ ] Error hierarchy: all errors extend AuthClientError with typed discriminators
- [ ] No console.log/console.error — errors surfaced via typed exceptions only
- [ ] No side effects on import — all I/O deferred to function calls
- [ ] Single runtime dependency: jose
- [ ] Test coverage >= 90%
- [ ] Nx build, lint, test all pass
- [ ] README and TSDoc complete
