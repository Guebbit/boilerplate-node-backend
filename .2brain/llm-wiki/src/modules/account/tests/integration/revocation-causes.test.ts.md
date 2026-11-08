---
source: src/modules/account/tests/integration/revocation-causes.test.ts
sha256: 5d1a83f59c461f197cbe1a56b05f7740ef6d71c3a4e63c966951b4a01550dada
generated_at: 2026-11-08T04:41:21.191396+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/revocation-causes.test.ts

## Purpose

Integration test that fires every `RevocationCause` through its real API door and asserts the observable effects declared in the `REVOCATION` table: whether the victim session dies, whether the caller keeps a session, whether pending verification links are purged, and whether an outbox announcement is written. Runs the full matrix in both `jwt` and `cookie` session modes.

## Key elements

- **`TRIGGERS: Record<RevocationCause, Trigger>`** — Exhaustive mapping from every key in `REVOCATION` to a function that fires that cause via its real endpoint. Adding a cause to the domain table without a corresponding entry here is a compile error.
- **`accountWithVictim(email)`** — Creates a verified user, plants a pending verification token, and signs in a second device (the "victim"). Returns the user, victim bearer, and a `fire` callable.
- **`via*` trigger functions** (one per cause: `viaPasswordChange`, `viaPasswordReset`, `viaLogoutAll`, `viaEmailConfirm`, `viaEmailUndo`, `viaTwoFactorConfirm`, `viaBan`, `viaDeletion`, `viaRefreshReuse`) — Each builds a scenario and returns a `Scenario` whose `fire()` hits the real HTTP endpoint (or calls `rotateRefreshToken` directly for the refresh-reuse case).
- **`loginAs(email)`** — Signs in under the current `sessionMode`, returning a `Bearer` header and, in jwt mode, the `__Host-session` cookie header.
- **`works(bearer)`** — `GET /account` probe; returns `true` if the token still authenticates.
- **`JWT_ONLY`** — Set of causes (`refresh-reuse`) excluded from cookie-mode runs because a refresh-token replay has no cookie-mode equivalent.
- **Main test body** — `describe.each(MODES)` × `describe.each(causes)`: "ends the other device, as its row says." After `fire()`, asserts victim is dead, caller session count matches `row.callerKeeps`, `verify` token presence matches `!row.pending`, and outbox row matches `row.announce`.

## Relationships

- **`src/modules/account/domain/revocation.ts`** — Provides the `REVOCATION` table and `RevocationCause` type; the table's keys drive both the `TRIGGERS` record and the test matrix.
- **`src/kernel/outbox.ts`** — `outboxEventModel` is queried to verify the `account.sessions_revoked` announcement; `settleOutboxNudges` flushes pending outbox work before assertions.
- **`src/modules/account/session/jwt.ts`** — `startSession`, `rotateRefreshToken`, and `TokenReuseError` are used directly by the `refresh-reuse` trigger.
- **`src/modules/account/tests/factories.ts`** — `plantToken` (seeds pending tokens), `sessionRowsOf` and `tokenTypesOf` (inspect session/token state for assertions).
- **`src/modules/users/tests/factories.ts`** — `createUser`, `PLAIN_PASSWORD`, `REPLACEMENT_PASSWORD` for test fixtures.
- **`src/modules/users/repository.ts`** — `userRepository.updateMany` sets `pendingEmail` / `previousEmail` for the email-change triggers.
- **`tests/support/http.ts`** — `api` and `authenticateAs` for all HTTP calls and admin auth.
- **`tests/support/cookies.ts`** — `cookieHeader` extracts the `__Host-session` cookie from login responses.
- **`tests/support/environment.ts`** — `setEnvironment` configures `NODE_SESSION_MODE`, `NODE_MAIL_TRANSPORT`, and token-grace windows per test.
- **`tests/support/setup-test-db.ts`** — `setupTestDb` provisions an isolated database.
- **`tests/support/totp.ts`** — `codeFor` generates a valid TOTP code for the two-factor trigger.

## Notes

- **Compile-time exhaustiveness:** `TRIGGERS` is typed as `Record<RevocationCause, Trigger>`. If a new cause is added to `REVOCATION` without a matching trigger here, the build fails. There is no runtime "skip" path.
- **`PAST_THE_SECOND_MS` (1100 ms):** The `sleep` before `fire()` guarantees any token minted during setup falls *before* the epoch the trigger sets, so "other device" is unambiguously older.
- **`NODE_TOKEN_ROTATION_GRACE_MS: '1'`:** The grace window is 1 ms; the 20 ms sleep in `viaRefreshReuse` exceeds it so the replay is treated as theft rather than a legitimate race.
- **Cookie mode:** In `cookie` mode the login body includes `transport: 'bearer'`, making the bearer the sole credential. The `Cookie` header is empty for non-jwt mode.
