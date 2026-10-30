---
source: src/modules/api-keys/tests/integration/revoked-by-account.test.ts
sha256: 0a4e198b4c9a271cd6488c0a28daf3e2340d4ae59d149bf0ef4e8205c949ce3e
generated_at: 2026-10-29T03:16:43.075104+00:00
model: ollama:qwen3.8:27b
---

# src/modules/api-keys/tests/integration/revoked-by-account.test.ts

## Purpose

Integration tests proving that the `account` module emits the `sessions-revoked` event (delivered via the outbox) on the security-critical paths that should end every API key a user minted: logout-everywhere, password reset, and email-change undo. It also verifies the negative cases where keys must survive (replayed refresh token, ordinary password change) and the suspension-then-restore lifecycle during a scheduled account deletion. Event *handling* is covered elsewhere in `api-keys.test.ts`; this file only confirms `account` actually fires the event at the right moments.

## Key elements

- **`adminWithKey()`** – helper that creates a verified admin user, mints a live API key via `mint()`, performs an HTTP login, and returns `{ user, bearer, secret }` for use in each test.
- **`describe('keys end with the sessions that may be compromised')`** – five tests covering: logout-everywhere, password-reset confirm, email-change undo (all revoke the key), a replayed refresh token (revokes sessions but *not* the key), and an ordinary password change (leaves the key intact).
- **`describe('keys wait out a scheduled account deletion')`** – one test showing a scheduled deletion *suspends* the key (resolver refuses it) and a subsequent restore *reactivates* it, without any revocation event.
- **`settleOutboxNudges()`** – called after each HTTP action that should emit an event; flushes the outbox relay so the revocation is applied before assertions.
- **`credentialOf(secret)`** – test-support helper that resolves a key's current status; `toBeDefined()` means active, `toBeUndefined()` means revoked/suspended.

## Relationships

- **`src/modules/api-keys/module.ts`** – `apiKeysModule.onRegistered?.()` is invoked at module load to install the credential resolver (mirrors real boot).
- **`src/modules/api-keys/services/api-keys.ts`** – `mint()` creates the API key under test.
- **`src/modules/account/tests/factories.ts`** – `plantToken` seeds token rows (password reset, email-change-undo, account-restore); `sessionRowsOf` inspects surviving sessions.
- **`src/modules/users/tests/factories.ts`** – `createUser`, `userRepository`, `PLAIN_PASSWORD`, `REPLACEMENT_PASSWORD` provide user setup and password constants.
- **`src/kernel/outbox.ts`** – `settleOutboxNudges` drains the outbox so the `sessions-revoked` event is delivered before assertions.
- **`src/kernel/access/tenant.ts`** – `DEPLOYMENT_TENANT_ID` identifies the single-tenant context.
- **`src/kernel/permissions.ts`** – `permissionsOfRole('admin')` builds the permission set for the caller context.
- **`src/types/index.ts`** – `TenantCallerContext` type for the `mint()` call.
- **`tests/support/http.ts`** – `api()` Supertest instance for all HTTP calls.
- **`tests/support/cookies.ts`** – `cookieHeader()` extracts the session cookie from a login response.
- **`tests/support/credentials.ts`** – `credentialOf()` resolves a key's live status.
- **`tests/support/environment.ts`** – `setEnvironment()` adjusts `NODE_TOKEN_ROTATION_GRACE_MS` for the replay test.
- **`tests/support/setup-test-db.ts`** – `setupTestDb()` bootstraps the in-memory DB before tests run.

## Notes

- The file explicitly does **not** test event *handling*; that lives in `api-keys.test.ts`. It only asserts the event was emitted and applied (key gone) or was *not* emitted (key still present).
- The replayed-refresh-token test is a deliberate negative: the codebase treats a stolen refresh token as insufficient proof that a deliberately-minted key was compromised, so sessions are killed but the key survives. The inline comment in the test makes this design intent explicit.
- Account deletion is a **suspension** (202 Accepted, resolver refuses), not a revocation. No outbox event fires; the key simply returns after a restore token is confirmed.
- `apiKeysModule.onRegistered?.()` is called once at the top of the file (not in `beforeEach`), mirroring the one-time boot registration of the credential resolver.
- `FRONTEND` is declared *after* `beforeEach` references it; this works because the callback is invoked later, but it's a readability trap.
