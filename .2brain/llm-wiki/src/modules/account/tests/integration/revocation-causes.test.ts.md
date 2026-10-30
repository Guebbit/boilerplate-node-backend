---
source: src/modules/account/tests/integration/revocation-causes.test.ts
sha256: 6a338072e1b59ce65ee620606268167ce991fb522294e4d270287747f3e0b840
generated_at: 2026-10-29T02:59:46.708691+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/revocation-causes.test.ts

## Purpose

Integration test that fires every revocation cause through its real HTTP endpoint (or, for refresh-reuse, the real token-rotation path) and asserts the full contract the `REVOCATION` row claims: the victim device is revoked, the caller's session state matches `callerKeeps`, pending links are purged iff `pending` is true, and the outbox announcement matches `announce`. The `Record<RevocationCause, Trigger>` type means a cause added to the domain table without a corresponding trigger here is a compile error.

## Key elements

- **`TRIGGERS`** — `Record<RevocationCause, Trigger>` mapping each cause to a function that sets up a scenario and exposes a `fire()` that hits the real endpoint. Exhaustive by type.
- **`viaPasswordChange`, `viaPasswordReset`, `viaLogoutAll`, `viaEmailConfirm`, `viaEmailUndo`, `viaTwoFactorConfirm`, `viaBan`, `viaDeletion`, `viaRefreshReuse`** — one trigger builder per cause; each returns a `Scenario` (`userId`, `victim` bearer, `fire` closure).
- **`accountWithVictim`** — creates a verified user, plants a pending verification token, and signs in a victim device.
- **`loginAs`** — mode-aware login (`jwt` vs `cookie`); in cookie mode sends `transport: 'bearer'` to get a bearer client.
- **`works(bearer)`** — `GET /account` probe; returns `true` if the token still authenticates.
- **`JWT_ONLY`** — set of causes (`refresh-reuse`) excluded from cookie-mode runs.
- **`describe.each(MODES)` / `describe.each(causes)`** — nested parameterized loop; the inner test ("ends the other device, as its row says") asserts all four row claims.

## Relationships

- **`src/modules/account/domain/revocation.ts`** — source of the `REVOCATION` table and `RevocationCause` type; the test iterates its keys and reads each row's `pending`, `announce`, `callerKeeps` fields as the expected assertions.
- **`src/kernel/outbox.ts`** — `outboxEventModel` queried to verify the `account.sessions-revoked` announcement; `settleOutboxNudges` called after `fire()` to flush queued events.
- **`src/modules/account/session/jwt.ts`** — `startSession`, `rotateRefreshToken`, `TokenReuseError` used directly by the `viaRefreshReuse` trigger to replay a superseded refresh token.
- **`src/modules/account/tests/factories.ts`** — `plantToken` (seed pending/one-time tokens), `sessionRowsOf` (count live sessions), `tokenTypesOf` (list surviving token types).
- **`src/modules/users/tests/factories.ts`** — `createUser`, `PLAIN_PASSWORD`, `REPLACEMENT_PASSWORD` for account setup and password-change payloads.
- **`src/modules/users/repository.ts`** — `userRepository.updateMany` used in email-change triggers to set `pendingEmail`/`previousEmail` directly.
- **`tests/support/http.ts`** — `api()` for all HTTP calls; `authenticateAs('admin')` for the deactivation trigger.
- **`tests/support/environment.ts`** — `setEnvironment` to toggle `NODE_MAIL_TRANSPORT`, token rotation/grace windows, and `NODE_SESSION_MODE` per test.
- **`tests/support/cookies.ts`** — `cookieHeader` to extract the `__Host-session` cookie for jwt-mode assertions.
- **`tests/support/totp.ts`** — `codeFor` to generate a valid TOTP code for the two-factor-change trigger.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` called once at module scope to provision a fresh database.

## Notes

- **Compile-time exhaustiveness**: `TRIGGERS` is typed as `Record<RevocationCause, Trigger>`, so the compiler enforces one trigger per cause. There is no runtime registry to forget.
- **`PAST_THE_SECOND_MS` (1100 ms)**: a sleep inserted before `fire()` so any pre-existing token's epoch falls behind the revocation epoch; without it, token-expiry checks could race.
- **Mode split**: the test runs the entire suite under both `jwt` and `cookie` session modes. `refresh-reuse` is excluded from cookie mode because a refresh-token replay has no cookie-mode equivalent.
- **Single assertion per cause**: despite multiple checks, each cause is validated by one `it` block, keeping failure output scoped to a single cause.
- **`viaRefreshReuse` fires differently**: it calls `rotateRefreshToken` directly (not through HTTP) and asserts a rejection, because replay detection lives in the token-rotation module, not behind an endpoint.
