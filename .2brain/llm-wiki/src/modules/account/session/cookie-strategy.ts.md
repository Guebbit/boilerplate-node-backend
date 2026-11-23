---
source: src/modules/account/session/cookie-strategy.ts
source_sha256: 355e331a01ea9dedecbd01ddd66e4a0c2fb5ebbfcc4592617739d10fc4e709fd
context_sha256: ac20bf2790b88e85f8ac69789e92dff5f08ab236563a748c8c20769d524a67b1
generated_at: 2026-11-22T03:45:53.449025+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/session/cookie-strategy.ts

## Purpose
Implements the `cookie` session mode: one random session id per sign-in, stored server-side only as its sha256 in a `sessions` row. Browsers carry it in an HttpOnly `__Host-session` cookie; other clients receive it as `ses_…` and send it as `Authorization: Bearer`. There is no signing key, refresh or rotation race, and logout is a row delete.

## Key elements
- `USE_STAMP_INTERVAL_MS` – `lastUsedAt` is written at most once per minute (`MINUTE_MS`).
- `rememberOf(row)` – maps a row's stored `remember` string back to a `RememberTier`, or `undefined` for a browser-session login.
- `storeSession(userId, proof, remember, inherited)` – generates a new id, inserts a `mode: 'cookie'` row (hashed token, `authTime` in seconds, `amr`, expiry, optional device and `familyId`/`startedAt`/`expiresAt` inherited from a replaced session), records activity, and returns the plaintext id and expiry.
- `deliver(response, started, remember, transport)` – for `bearer` transport returns `{ sessionToken }`. Otherwise it sets the session cookie, persistent only for remembered sessions.
- `credentialOf(request)` – takes the `ses_…` bearer if present, else the session cookie.
- `transportOf(request)` – `bearer` if `request.sessionVia === 'bearer'`, else `cookie`.
- `snapshotOf(request, userId)` – reads the caller's own cookie-mode row (must belong to `userId`) and returns its remember tier, family, start, expiry and device. It returns `{}` if there is no live session.
- `replaceSession(...)` – stores the successor first, then deletes the old row. A failure in between leaves two sessions rather than none. A delete failure is logged and swallowed.
- `retirePresentedSession(request)` – on a new sign-in, removes the whole family of the presented session, with the same store-first logic and a logged, swallowed failure.
- `stampDue(row)` – whether `lastUsedAt` is missing or older than the interval.
- `findLiveRow(id)` – returns a `Resolution` with a miss of `malformed`, `revoked` (unknown, other-mode, or a JWT left over from `jwt` mode) or `expired`, else `ok: row`.
- `resolveRowProof(row)` – calls `resolveProof` with the row's `authTime` and `amr`.
- `resolveSession(id, options)` – resolves an id to an `AuthContext`:
  - Ends the whole family and answers `idle` for a staff session idle past its limit.
  - Ends the whole family and answers `expired` for a staff session past its absolute cap.
  - Otherwise stamps `lastUsedAt` fire-and-forget via `sessionRepository.touch` when the stamp is due and the request is not `passive`. It then calls `recordActivity`, and a failure is logged.

## Relationships
- **`../repository`** – `sessionRepository` (`insert`, `findByHash`, `removeByHash`, `removeFamilyByHash`, `removeFamily`, `touch`) and the `SessionRow` type are the persistence layer.
- **`@infrastructure/security/hash-token`** – `hashToken` hashes ids before storage and lookup.
- **`@kernel/cookies`** – `bearerOf` and `readSessionCookie` extract credentials. `./cookies` supplies `createSessionCookie`.
- **`@kernel/authentication`** – supplies the `Resolution` and `StreamWatch` types.
- **`./auth-context`** – `resolveProof` builds the `AuthContext`.
- **`./config`** – `getExpiryTimeMilliseconds(remember)` gives the lifetime per tier.
- **`./idle`** – `hasIdledOut` and `hasOutlivedStaffCap` apply the staff limits.
- **`./activity`** – `recordActivity` is called after inserts and stamps.
- **`./mint-guard`**, **`./family-liveness`**, **`./listing`**, **`./device-label`** – imported helpers (`assertProofCurrent`, `assertSecondFactor`, `resolveInLiveFamily`, `listSessions`, `describeDevice`). The visible part of the file does not show their use.
- **`@infrastructure/adapters/logger`** – the `logger` is used to report non-fatal cleanup and stamp failures.
- **`@domain-primitives/time`** – `MINUTE_MS`.

## Notes
- `authTime` is set at login and renewed only by `POST /account/reauth`, never by use. Step-up therefore behaves as in `jwt` mode.
- The id is replaced on every re-proof, as OWASP advises for a privilege change. The session keeps its public id (`familyId`), start time and absolute expiry.
- A non-remembered session's cookie is a browser-session cookie, but its server-side limit is still the `short` tier. A remembered cookie lasts until the row's expiry, with a minimum of 1 second.
- The plaintext id exists only at creation, and only the hash is persisted.
- `lastUsedAt` housekeeping is off the request path, so a lost write only makes the stored reading stale.
