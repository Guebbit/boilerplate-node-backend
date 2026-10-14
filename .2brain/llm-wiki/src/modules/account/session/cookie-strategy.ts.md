---
source: src/modules/account/session/cookie-strategy.ts
sha256: 09d2b31123955671b5b7f2f983564b882cf11815bb4faf6f86243668a4c99cea
generated_at: 2026-10-14T14:38:31.110699+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/session/cookie-strategy.ts

## Purpose

Implements the `cookie` session strategy: one random session ID per sign-in, persisted only as its SHA-256 in a `sessions` row. The ID is delivered to browsers via an HttpOnly `__Host-session` cookie and to other clients as a `ses_…` Bearer token. No signing keys, refresh tokens, or rotation races — logout is a row delete, and every request already reads the row to resolve the caller.

## Key elements

- **`cookieStrategy`** (exported) — the `SessionStrategy` object wiring together all operations: `issue`, `snapshot`, `reissue`, `remint`, `resolveBearer`, `resolveCookie`, `credentialOf`, `list`.
- **`storeSession`** — generates a fresh ID via `newSessionId()`, inserts a `sessions` row (hash, amr, expiry, optional device/family), returns the plaintext ID and expiry.
- **`deliver`** — sets the session cookie (with optional `maxAge` for remembered tiers) plus a logged-in cookie, or returns `{ sessionToken }` for bearer transport.
- **`credentialOf`** — extracts the session ID from the incoming request (Bearer header or cookie).
- **`snapshotOf`** — reads the caller's current row to inherit `familyId`, `startedAt`, `expiresAt`, `device`, `remember`.
- **`replaceSession`** — stores the successor row first, then deletes the predecessor; a failure between the two leaves two sessions rather than zero.
- **`retirePresentedSession`** — on a fresh sign-in, deletes the entire family of the previously presented session.
- **`resolveSession`** — validates format, looks up by hash, checks mode/expiry, calls `resolveProof`, and fire-and-forgets a throttled `touch` (≥ 60 s apart) for `lastUsedAt`.
- **`rememberOf`** — maps a stored `remember` value back to the `RefreshTokenExpiryTime` enum (or `undefined`).
- **`USE_STAMP_INTERVAL_MS`** — 60 000 ms; how often a busy tab may write `lastUsedAt`.

## Relationships

- **`strategy.ts`** — defines the `SessionStrategy` interface and shared types (`IssuedSession`, `IssueOptions`, `SessionTransport`, etc.) that this file implements.
- **`repository.ts`** — `sessionRepository` provides `insert`, `findByHash`, `removeByHash`, `removeFamilyByHash`, `touch`; `SessionRow` type.
- **`cookies.ts`** (session) — `createSessionCookie`, `createLoggedCookie` set response cookies.
- **`@kernel/cookies`** — `readSessionCookie` reads the incoming `__Host-session` cookie.
- **`@kernel/authentication`** — `Resolution` type used as the return shape of `resolveSession`.
- **`auth-context.ts`** — `resolveProof` builds the `AuthContext` from stored `authTime`/`amr`.
- **`config.ts`** — `RefreshTokenExpiryTime` enum and `getExpiryTimeMilliseconds` for computing expiry.
- **`session-id.ts`** — `newSessionId` (generate) and `looksLikeSessionId` (validate format).
- **`@infrastructure/security/hash-token`** — `hashToken` (SHA-256) for all persistence and lookups.
- **`activity.ts`** — `recordActivity` called after a new session is stored or a `touch` actually wrote.
- **`mint-guard.ts`** — `assertSecondFactor` enforces step-up before issuing.
- **`device-label.ts`** — `describeDevice` captures the UA string at sign-in time.
- **`listing.ts`** — `listSessions` backs the `list` operation.
- **`@infrastructure/adapters/logger`** — structured warn logs for non-fatal failures (retirement, stamp, remint).
- **`cookie-strategy.test.ts`** — unit tests for the strategies above.

## Notes

- **Stored-first ordering.** Both `replaceSession` and `retirePresentedSession` insert/delete the *new* row before removing the old one, so a crash mid-operation leaves two live sessions rather than zero.
- **Bearer clients skip `remint`.** A bearer session has no cookie to refresh; the strategy resolves to a no-op, expecting the client to sign in again.
- **`authTime` is not renewed by use.** Only an explicit `POST /account/reauth` (which calls `reissue`) updates it, preserving step-up semantics identical to `jwt` mode.
- **`remint` failures are swallowed.** If the session change already succeeded but re-minting the cookie failed, the error is logged and the response is sent anyway.
- **Plaintext ID is ephemeral.** It exists only inside `storeSession` → `deliver`; the database and all lookups use the SHA-256 digest.
- **`lastUsedAt` writes are throttled** to at most once per minute via the `touch` interval parameter, preventing a busy tab from issuing a write per request.
