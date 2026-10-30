---
source: src/modules/account/session/cookie-strategy.ts
sha256: 73b60ceec16a9652f718c4f215302c84dc729cd6cbf652d74d783adf3ed540cd
generated_at: 2026-10-29T02:47:45.593528+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/session/cookie-strategy.ts

## Purpose

Implements the `cookie` session strategy: a single random session id stored only as its SHA-256 hash in a `sessions` row, delivered to browsers via an HttpOnly `__Host-session` cookie and to other clients as a `ses_…` Bearer token. Owns the full lifecycle — mint, resolve, rotate-on-re-proof, retire, and activity stamping — without signing keys, refresh tokens, or rotation races.

## Key elements

- **`storeSession`** – Inserts a new session row (hash, mode, authTime, amr, expiry, inherited family/device). Returns the plaintext id (exists only in this call) and the expiry date.
- **`deliver`** – Writes the credential to the response: sets the session cookie for browser transport, or returns the raw id for Bearer transport.
- **`credentialOf` / `transportOf`** – Extracts the session id from a request (Bearer header or cookie) and records which transport the caller used.
- **`snapshotOf`** – Reads the caller's current row to obtain family id, startedAt, expiresAt, device, and remember tier for inheritance by a replacement.
- **`replaceSession`** – Stores the successor row first, then deletes the predecessor's row (stored-first so a crash leaves two sessions, never zero).
- **`retirePresentedSession`** – Deletes the presented session's entire family on a fresh sign-in; same stored-first safety (delete-only here).
- **`findLiveRow`** – Resolves a presented id to its live row; classifies JWTs as `'revoked'`, unrecognised values as `'malformed'`, wrong-mode/expired as `'revoked'`/`'expired'`.
- **`resolveSession`** – Full resolution pipeline: find row → resolve proof → check idle/staff-cap (deletes family on hit) → fire-and-forget `lastUsedAt` stamp (throttled to 60 s) → return `Resolution<AuthContext | undefined>`.
- **`stampDue`** – Gate: true when `lastUsedAt` is absent or older than `USE_STAMP_INTERVAL_MS` (60 000 ms).
- **`rememberOf`** – Maps the row's stored `remember` value back to a `RememberTier` enum member.
- **`Inherited`** – Type for the subset of a snapshot a replacement session carries forward (familyId, startedAt, expiresAt, device).

## Relationships

- **`session-id.ts`** – Provides `newSessionId` (mint), `looksLikeSessionId` / `looksLikeJwt` (classification in `findLiveRow`).
- **`hash-token.ts`** – `hashToken` hashes every id before storage or lookup; the plaintext id never persists.
- **`repository.ts`** – `sessionRepository` performs all row inserts, lookups by hash, removals, family deletes, and `touch` stamps.
- **`auth-context.ts`** – `resolveProof` turns a row's `authTime`/`amr` into an `AuthContext` (roles, epoch check).
- **`idle.ts`** – `hasIdledOut` and `hasOutlivedStaffCap` gate resolution and trigger family deletion.
- **`activity.ts`** – `recordActivity` is called after a new session is stored and after a successful stamp write.
- **`config.ts`** – `getExpiryTimeMilliseconds` computes TTL from the remember tier.
- **`cookies.ts` (kernel)** – `bearerOf` / `readSessionCookie` extract the credential from incoming requests.
- **`cookies.ts` (session)** – `createSessionCookie` sets the HttpOnly `__Host-session` cookie on the response.
- **`authentication.ts` (kernel)** – Supplies the `Resolution` union type and `StreamWatch` (used in the truncated stream-section).
- **`logger.ts`** – Warns on non-fatal retirement or stamp failures.
- **`mint-guard.ts`** – `assertProofCurrent` / `assertSecondFactor` guard the mint path (used in the truncated portion).
- **`family-liveness.ts`** – `resolveInLiveFamily` (used in the truncated portion for family-aware lookups).
- **`listing.ts`** – `listSessions` (used in the truncated portion for the account session list).
- **`device-label.ts`** – `describeDevice` (used in the truncated portion to populate the row's `device` field).

## Notes

- **Stored-first ordering:** `replaceSession` and `retirePresentedSession` write the successor before deleting the predecessor. A crash in between leaves two valid sessions rather than none; the caller still has a working credential.
- **Id rotation on re-proof:** A new random id is minted on every privilege re-proof (OWASP recommendation), but `familyId`, `startedAt`, and `expiresAt` are inherited so the user's visible session identity is stable.
- **`authTime` is login-time, not use-time:** It is set at mint and renewed only by an explicit reauth call; passive use never refreshes it, keeping step-up semantics consistent with JWT mode.
- **Stamp throttle:** `lastUsedAt` is written at most once per 60 s per session. The check reads the row already in hand (no extra query), and the write is fire-and-forget (`void …catch`), so a lost stamp only costs a stale idle reading.
- **JWT in a cookie-mode browser:** If a stale `jwt_…` token is presented, `findLiveRow` returns `{ miss: 'revoked' }` rather than `'malformed'`, signalling a mode switch rather than a forgery attempt.
- **`passive` option:** SSE/stream health-checks pass `passive: true` so they are judged for validity but never counted as activity.
