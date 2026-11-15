---
source: src/modules/api-keys/tests/integration/revoked-by-account.test.ts
sha256: e87fad4fad1f94d35d03ece9a2d82f81554a8d17fe8711aeaa415f4133c2e288
generated_at: 2026-11-14T19:22:58.246738+00:00
model: ollama:qwen3.8:27b
---

# src/modules/api-keys/tests/integration/revoked-by-account.test.ts

## Purpose

Integration test that proves the `account` HTTP endpoints (logout-everywhere, password-reset confirm, email-change undo) actually emit the `sessions_revoked` event and that this cascades to revoke any API keys the account holder minted. It complements `api-keys.contract.test.ts`, which exercises the revocation handler in isolation; this file verifies the event is produced at the right moment over real HTTP.

## Key elements

- **`adminWithKey()`** — helper that creates a verified admin user, mints a key via `mint()` with a 7-day expiry, and logs in to obtain a bearer token. Returns `{ user, bearer, secret }`.
- **`credentialOf(secret)`** (from `tests/support/credentials`) — the assertion oracle; tests assert `toBeUndefined()` once a key is revoked and `toBeDefined()` while it is live.
- **`settleOutboxNudges()`** (from `kernel/outbox`) — flushes the outbox relay so the revocation event is delivered synchronously in the test.
- **Suite "keys end with the sessions…"** — five tests:
  - `DELETE /account/sessions` revokes keys.
  - `POST /account/password/reset/confirm` revokes keys.
  - `POST /account/email-change/undo` revokes keys.
  - Replayed refresh token (401, sessions wiped) does **not** revoke keys.
  - Ordinary password change (owner proves current password) does **not** revoke keys.
- **Suite "keys wait out a scheduled account deletion"** — `DELETE /account` (202) suspends key resolution; `POST /account/restore` reactivates it.

## Relationships

- **`src/modules/api-keys/module.ts`** — `onRegistered()` installs the credential resolver into the app, making `credentialOf()` meaningful.
- **`src/modules/api-keys/services/api-keys.ts`** — `mint()` is called directly to create the key under test.
- **`src/modules/account/tests/factories.ts`** — `plantToken` creates one-time tokens for reset/undo/restore flows; `sessionRowsOf` verifies session wipe-out.
- **`src/modules/users/tests/factories.ts`** — `createUser`, `PLAIN_PASSWORD`, `REPLACEMENT_PASSWORD` seed the user and provide the password constants.
- **`src/modules/users/repository.ts`** — `userRepository.updateMany` is used to set `previousEmail` on the user before the email-change-undo test.
- **`src/kernel/outbox.ts`** — `settleOutboxNudges` is the bridge that makes the async revocation event observable in the test.
- **`src/kernel/access/tenant.ts`** / **`src/kernel/permissions.ts`** — supply `DEPLOYMENT_TENANT_ID` and `permissionsOfRole('admin')` to build the `TenantCallerContext` passed to `mint`.
- **`src/types/index.ts`** / **`src/types/auth-context.ts`** — `TenantCallerContext` type for the mint call.
- **`tests/support/http.ts`**, **`tests/support/cookies.ts`**, **`tests/support/environment.ts`**, **`tests/support/setup-test-db.ts`** — shared test infrastructure (HTTP client, cookie parsing, env overrides, DB lifecycle).

## Notes

- `FRONTEND` is a `const` declared *after* the `beforeEach` registration but *before* any test body executes, so the closure captures it correctly at run-time.
- The replayed-refresh-token test sets `NODE_TOKEN_ROTATION_GRACE_MS: '0'` *after* the initial refresh to eliminate the grace window and force a 401 on replay.
- The email-change-undo test requires `previousEmail` to be set on the user (via direct `userRepository.updateMany`) in addition to the planted token; without both, the endpoint would 400 before reaching the revocation path.
- The account-deletion test asserts a **202** (accepted/scheduled), not 204, because deletion is asynchronous and the key is merely suspended, not destroyed.
