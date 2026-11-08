---
source: src/modules/account/session/cookie-strategy.ts
sha256: 6f09281cc022057c3b13f980f4cc6109a99b1bcb5c32c1576dbfcac5f8cc5adc
generated_at: 2026-11-08T04:27:12.668909+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/session/cookie-strategy.ts

## Purpose

Implements the `cookie` session mode: one random session ID per sign-in, stored only as its SHA-256 in a `sessions` row. Browsers carry it in an HttpOnly `__Host-session` cookie; other clients receive it as a `ses_…` bearer token. The file provides the full lifecycle—store, resolve, replace (on re-proof), and retire—of these rows, with no signing key, refresh, or rotation race.

## Key elements

- **`storeSession`** – Inserts a new session row (hash of a fresh `ses_…` id) and returns the plaintext id plus expiry. Accepts an `Inherited` snapshot so a replacement keeps family id, start time, expiry, and device.
- **`deliver`** – Hands the credential to the caller: sets an HttpOnly cookie (with or without a `Max-Age`) for browser transport, or returns the raw id for bearer transport.
- **`credentialOf` / `transportOf`** – Extract the session id from a request (bearer header or cookie) and determine which transport the caller used.
- **`snapshotOf`** – Reads the caller's current row to produce the `Inherited` fields a replacement should carry.
- **`replaceSession`** – OWASP re-proof path: stores the successor first, then deletes the old row. A failure between the two leaves two sessions rather than zero.
- **`retirePresentedSession`** – Deletes the entire family of the session a new sign-in is replacing; also store-first / delete-second ordering.
- **`findLiveRow`** – Resolves an id to a live `SessionRow`; returns typed misses (`revoked`, `expired`, `malformed`). A JWT-shaped id is classified `revoked`, not `malformed`.
- **`resolveSession`** – Main resolution entry point. Checks idle timeout and staff-cap expiry (deleting the family on violation), throttles the `lastUsedAt` stamp to once per minute, and returns an `AuthContext` or a typed miss.
- **`stampDue`** – Pure predicate: is `lastUsedAt` missing or ≥ `USE_STAMP_INTERVAL_MS` (1 min) old?
- **`resolveRowProof`** – Delegates to `resolveProof` to turn a row's `authTime`/`amr` into an `AuthContext`.
- **`rememberOf`** – Maps a row's stored `remember` value back to a `RememberTier` enum member.
- **`USE_STAMP_INTERVAL_MS`** – Constant (`MINUTE_MS`) governing the `lastUsedAt` write throttle.

## Relationships

- **`@domain-primitives/time`** – Supplies `MINUTE_MS` used as the `lastUsedAt` write throttle.
- **`@infrastructure/adapters/logger`** – Emits warnings for non-fatal failures (retire, stamp, touch).
- **`@infrastructure/security/hash-token`** – Hashes session IDs before every DB lookup or store; the plaintext id never persists.
- **`@kernel/cookies`** – Provides `bearerOf` and `readSessionCookie` for credential extraction from requests.
- **`@kernel/authentication`** – Supplies the `Resolution<T>` discriminated-union type used throughout.
- **`../repository`** – All row CRUD (`insert`, `findByHash`, `removeByHash`, `removeFamily`, `touch`) goes through `sessionRepository`.
- **`./activity`** – `recordActivity` bumps the user's last-activity timestamp on login and on a successful stamp write.
- **`./auth-context`** – `resolveProof` converts a row's proof data into the `AuthContext` the rest of the app consumes.
- **`./config`** – `getExpiryTimeMilliseconds` determines session TTL from the remember tier.
- **`./cookies`** – `createSessionCookie` sets the HttpOnly `__Host-session` cookie on the response.
- **`./idle`** – `hasIdledOut` and `hasOutlivedStaffCap` enforce per-role idle and staff-lifetime limits; on violation the whole family is deleted.
- **`./mint-guard`** – `assertProofCurrent` / `assertSecondFactor` guard the re-mint path (visible in the truncated export).
- **`./family-liveness`**, **`./listing`**, **`./device-label`** – Used in the truncated portion for family checks, session listing, and device description.

## Notes

- **Store-then-delete ordering.** Both `replaceSession` and `retirePresentedSession` write the new row *before* deleting the old one. A crash between the two leaves a duplicate session rather than an unauthenticated user.
- **Plaintext id is ephemeral.** The raw `ses_…` string exists only in `storeSession`'s return value and the `deliver` call. At rest and in transit (DB, hash lookups) only the SHA-256 is stored.
- **`authTime` unit is seconds.** Stored as `Math.floor(provedAt / 1000)` to match OIDC `auth_time`, same as the `jwt` mode.
- **`lastUsedAt` is fire-and-forget.** The stamp write (`sessionRepository.touch`) is `void`-ed and its failure only logged; a missed stamp costs a stale reading, not a broken request. The throttle check runs on the row already in hand, so no extra query.
- **`passive` requests** (e.g. background liveness pings) are resolved and judged for idle/staff-cap but never trigger the `lastUsedAt` stamp or `recordActivity`.
- **JWT-in-session-slot is `revoked`, not `malformed`.** A browser that switched from `jwt` to `cookie` mode may still present a JWT; the code treats it as a stale credential of the other mode rather than a parsing failure.
- **File is truncated.** The `SessionStrategy` interface implementation (the exported strategy object wiring all the above into `issue`, `resolve`, `reauth`, `list`, etc.) and any remaining helpers appear below the cut point.
