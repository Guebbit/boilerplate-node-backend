---
source: src/modules/account/session/cookie-strategy.ts
sha256: 8b5c34abb7ba10b4f06cb2c6253465259ba8ac127d40877121ab78e33462c2b6
generated_at: 2026-10-15T10:05:58.446614+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/session/cookie-strategy.ts

## Purpose

Implements the `cookie` session mode: a server-side session identified by a random `ses_…` id, stored only as its SHA-256 hash in a `sessions` row. Browsers receive the id as an HttpOnly `__Host-session` cookie; non-browser clients receive it as a Bearer token. There is no JWT signing, no refresh-token rotation, and no race on rotation — logout is a row delete, and the row is read on every request anyway.

## Key elements

- **`storeSession`** – Generates a new id, hashes it, inserts a `sessions` row (family, amr, authTime, remember tier, device, expiry), records activity, and returns the plaintext id + expiry. Supports *inherited* identity (familyId, startedAt, expiresAt, device) for the replace-on-re-proof case.
- **`deliver`** – Hands the credential to the client: sets the session cookie (with optional `maxAge` for remembered tiers) or returns the id in the response body for Bearer transports.
- **`credentialOf` / `transportOf`** – Extract the presented id (Bearer or cookie) and determine which transport the caller used.
- **`snapshotOf`** – Reads the caller's current live row to inherit family/identity fields when a re-proof replaces it.
- **`replaceSession`** – Stores the successor row first, then deletes the old row; a failure between the two leaves two sessions rather than zero.
- **`retirePresentedSession`** – On a fresh sign-in, deletes the whole family of the previously presented session (also stored-first / delete-after).
- **`findLiveRow`** – Validates the id shape, looks up by hash, and checks mode/expiry. Distinguishes `revoked`, `expired`, and `malformed` misses.
- **`resolveSession`** – The main auth-resolve entry point: finds the row, resolves proof via `resolveProof`, checks idle timeout (kills the whole family), and throttled-stamps `lastUsedAt`. Returns `Resolution<AuthContext | undefined>`.
- **`watchSession`** – SSE stream re-check that follows the row's *family* (not the individual id) so a re-proof replacement doesn't close a still-open stream. *(truncated in source)*
- **`stampDue`** – Returns true when `lastUsedAt` is absent or older than the 60 s throttle.
- **`rememberOf`** – Maps a row's `remember` column back to a `RefreshTokenExpiryTime` enum value.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/kernel/cookies.ts` | `bearerOf`, `readSessionCookie` — parses incoming credentials |
| `src/kernel/authentication.ts` | `Resolution`, `StreamWatch` — shared resolution/type contracts |
| `src/infrastructure/adapters/logger.ts` | `logger.warn` — non-fatal failure logging (retire, stamp) |
| `src/infrastructure/security/hash-token.ts` | `hashToken` — SHA-256 before any DB lookup or storage |
| `src/modules/account/repository.ts` | `sessionRepository` CRUD (insert, findByHash, removeByHash, removeFamily, touch) + `SessionRow` type |
| `src/modules/account/session/activity.ts` | `recordActivity` — fires after a successful insert or a stamped `lastUsedAt` write |
| `src/modules/account/session/auth-context.ts` | `resolveProof` — turns a row's authTime/amr into an `AuthContext` (roles, step-up) |
| `src/modules/account/session/cookies.ts` | `createSessionCookie` — sets the `__Host-session` cookie on the Express response |
| `src/modules/account/session/config.ts` | `RefreshTokenExpiryTime` enum + `getExpiryTimeMilliseconds` — tier → TTL mapping |
| `src/modules/account/session/device-label.ts` | `describeDevice` — populates the `device` field on a new row *(usage in truncated portion)* |
| `src/modules/account/session/family-liveness.ts` | `resolveInLiveFamily` — family-level liveness check *(usage in truncated portion)* |
| `src/modules/account/session/idle.ts` | `hasIdledOut` — decides whether a session has exceeded its idle window for its roles |
| `src/modules/account/session/listing.ts` | `listSessions` — backs the "your sessions" endpoint *(usage in truncated portion)* |
| `src/modules/account/session/mint-guard.ts` | `assertProofCurrent`, `assertSecondFactor` — pre-mint validation gates *(usage in truncated portion)* |
| `src/modules/account/session/session-id.ts` | `newSessionId`, `looksLikeSessionId`, `looksLikeJwt` — id generation and shape discrimination |

## Notes

- **Stored-first invariant.** Both `replaceSession` and `retirePresentedSession` insert/delete the new row before removing the old one. A crash between the two steps yields *two* live sessions, never zero.
- **`lastUsedAt` throttle.** The 60 s window (`USE_STAMP_INTERVAL_MS`) is checked against the row already fetched for resolution, so a busy tab incurs no extra DB query per request.
- **`authTime` semantics.** Written at login in epoch *seconds* (OIDC `auth_time` unit) and renewed only by the explicit reauth endpoint, never by mere use. This keeps step-up behaviour consistent with `jwt` mode.
- **Re-proof replaces, not refreshes.** On a privilege change the id is swapped (OWASP guidance), but `familyId`, `startedAt`, `expiresAt`, and `device` are carried over via the `Inherited` type so the owner's public identity is stable.
- **`watchSession` follows the family, not the id.** A re-proof replaces the row but keeps the family; the SSE re-check must therefore match on `familyId` to avoid killing a stream the owner still holds.
- **Bearer vs. cookie is a transport detail, not a security boundary.** Both paths hash the same id and hit the same row; the distinction only affects how the credential is delivered and read.
- **`describeDevice`, `listSessions`, `resolveInLiveFamily`, and the mint-guard functions** are imported and exercised in the portion of the file beyond the truncation point shown here.
