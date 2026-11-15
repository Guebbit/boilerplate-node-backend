---
source: src/modules/account/session/cookie-strategy.ts
sha256: d73f3350b21b9692a59f8bd9f75e3c6c61d0abe600671f785e0988b8edf60945
generated_at: 2026-11-14T18:56:12.360345+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/session/cookie-strategy.ts

## Purpose

Implements the **cookie** session strategy: a single random session ID (stored only as its SHA-256 hash in a `sessions` row) that travels to browsers in an HttpOnly `__Host-session` cookie and to other clients as a `ses_…` Bearer token. No signing key, no refresh token, no rotation race — logging out is a row delete and the row is read on every request anyway. This file provides the full lifecycle: issue, resolve, replace (OWASP id renewal), and retire sessions.

## Key elements

- **`storeSession`** — Generates a new session ID, inserts a `sessions` row (hashing the ID via `hashToken`), and returns the plaintext ID (its only moment in memory) plus the computed expiry.
- **`deliver`** — Hands the issued credential to the client: sets the `__Host-session` cookie for browsers or returns `{ sessionToken }` for Bearer consumers.
- **`credentialOf`** / **`transportOf`** — Extract the presented credential and determine whether it arrived as Bearer or cookie, controlling how a replacement is handed back.
- **`snapshotOf`** — Reads the caller's current row to capture `familyId`, `startedAt`, `expiresAt`, `device`, and `remember` for inheritance on replacement.
- **`replaceSession`** — Stores the successor row first, then deletes the old row; a failure between the two leaves two sessions rather than none.
- **`retirePresentedSession`** — Deletes the entire family a new sign-in supersedes; same store-first safety pattern.
- **`findLiveRow`** — Resolves a presented ID to a live `cookie`-mode row; distinguishes `malformed`, `revoked` (other mode or JWT), and `expired` misses.
- **`resolveRowProof`** — Delegates to `resolveProof` to turn a row's `authTime`/`amr` into an `AuthContext`.
- **`resolveSession`** — Full per-request resolution: find row → resolve proof → enforce idle/staff-cap limits (deleting the family on breach) → fire-and-forget `lastUsedAt` stamp.
- **`stampDue`** — Returns whether `lastUsedAt` is missing or older than one minute, gating the throttled write.
- **`rememberOf`** — Maps a stored tier value back to the `RememberTier` enum (or `undefined`).
- **`USE_STAMP_INTERVAL_MS`** — Constant (`MINUTE_MS`) controlling how often a busy tab may write `lastUsedAt`.
- **`Inherited`** — Type for the fields a replacement session carries forward from its predecessor.

## Relationships

- **`@kernel/cookies`** — `bearerOf` and `readSessionCookie` extract the credential from incoming requests.
- **`@kernel/authentication`** — Provides the `Resolution<T>` tagged-union type used throughout for typed miss/ok results.
- **`@infrastructure/security/hash-token`** — `hashToken` produces the SHA-256 stored in the row; the plaintext ID never persists.
- **`@infrastructure/adapters/logger`** — Warns on non-fatal failures (retire, stamp) without interrupting the request.
- **`@domain-primitives/time`** — Supplies `MINUTE_MS` for the activity-stamp throttle.
- **`../repository`** — `sessionRepository` is the sole data-access point for `sessions` rows; `SessionRow` is the row shape.
- **`./activity`** — `recordActivity` is called after a successful store or stamp to update the account-level activity clock.
- **`./auth-context`** — `resolveProof` converts a row's `authTime`/`amr` into the `AuthContext` the caller sees.
- **`./config`** — `getExpiryTimeMilliseconds` computes the absolute expiry from the remembered tier.
- **`./device-label`** — `describeDevice` (imported for row construction context).
- **`./listing`** — `listSessions` (imported, likely for the strategy interface surface).
- **`./idle`** — `hasIdledOut` and `hasOutlivedStaffCap` gate resolution and trigger family deletion.
- **`./family-liveness`** — `resolveInLiveFamily` (imported for strategy completeness).
- **`./mint-guard`** — `assertProofCurrent` and `assertSecondFactor` guard the mint/re-mint path.
- **`./cookies`** — `createSessionCookie` sets the `__Host-session` response cookie.

## Notes

- **Store-first, delete-second.** Both `replaceSession` and `retirePresentedSession` insert the new row before removing the old one. A crash between the two leaves two live sessions — never zero.
- **Fire-and-forget stamp.** The `lastUsedAt` write in `resolveSession` is `void`-ed and caught; a lost stamp only costs a stale reading, never a failed request. The throttle check reuses the row already in hand, so a busy tab adds no extra query.
- **`authTime` semantics.** Set at login and renewed only by an explicit reauth call — keeping a session alive does not reset it, so step-up behaves identically to `jwt` mode.
- **JWT in the cookie slot.** If a value that `looksLikeJwt` appears where a session ID is expected, it is classified as `revoked` (stale from a mode switch), not `malformed`.
- **`rememberOf`** returns `undefined` (not a default tier) for browser-session logins, which propagates as "no explicit tier" into expiry calculation.
