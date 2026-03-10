# Feature 32: Device Token Authentication System

**Date:** 2026-03-09
**Status:** Complete

## Summary

Implemented the complete device token authentication system for the iExcel API. This enables terminal and agent users to authenticate via long-lived API keys (`ixl_` prefixed tokens) instead of JWTs, using a device-code-style authorization flow.

## Authentication Flow

1. Terminal calls `POST /auth/device/init` with a device fingerprint
2. API returns a session ID, user code, login URL, and expiry
3. User opens the login URL in a browser and authenticates via SSO
4. User approves the device via `POST /auth/device/approve` (JWT-protected)
5. Terminal polls `GET /auth/device/session/:sessionId` to retrieve the token
6. Token is stored locally and used as `Authorization: Bearer ixl_...` for all future requests

## Files Created

- `apps/api/src/utils/device-token.ts` -- Token generation, hashing, user code generation, fingerprint hashing, and token type detection utilities
- `apps/api/src/repositories/device-token-repository.ts` -- CRUD operations for device_tokens and device_sessions tables (follows integration-repository pattern)
- `apps/api/src/services/device-token-service.ts` -- Business logic for session init, approval, token validation, listing, and revocation
- `apps/api/src/validators/device-auth-validators.ts` -- Zod validation schemas for init and approve request bodies
- `apps/api/src/routes/device-auth.ts` -- Public routes (init, poll) and protected routes (approve, list tokens, revoke)

## Files Modified

- `packages/database/src/schema.ts` -- Added `plaintextToken` text column to `deviceSessions` table for temporary one-time token delivery
- `apps/api/src/middleware/authenticate.ts` -- Extended to support device tokens (ixl_ prefix detection, DB lookup, synthetic TokenClaims construction). Signature changed from `buildAuthMiddleware(validator)` to `buildAuthMiddleware(validator, db)`
- `apps/api/src/app.ts` -- Imported and registered device auth routes (public and protected scopes), updated buildAuthMiddleware call to pass db

## Migration

- `packages/database/migrations/0004_crazy_princess_powerful.sql` -- Adds `plaintext_token` column to `device_sessions` table

## API Endpoints

### Public (no auth required)
- `POST /auth/device/init` -- Start device auth session
- `GET /auth/device/session/:sessionId` -- Poll session status (returns token once when complete)

### Protected (JWT or device token required)
- `POST /auth/device/approve` -- Approve a device session and generate token
- `GET /auth/tokens` -- List user's active device tokens (metadata only)
- `DELETE /auth/tokens/:id` -- Revoke a device token

## Key Design Decisions

- Device tokens use SHA-256 hashing; plaintext is never stored permanently
- Plaintext token is temporarily stored in device_sessions for poll-based retrieval, then cleared after first read
- Auth middleware constructs synthetic TokenClaims with `sub = authUserId` so the existing loadUser middleware works identically for both JWT and device token paths
- Device fingerprints are stored as SHA-256 hashes for privacy
- Token format: `ixl_` + 32 random hex chars = 36 chars total
- Session TTL: 5 minutes
- `lastUsedAt` updates are fire-and-forget to avoid blocking API responses
