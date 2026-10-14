---
source: src/modules/api-keys/tests/integration/revoked-by-account.test.ts
sha256: 31af034b88cfac31febc2ec1e4645e3f823cd8aa4ccf60afcde5766defa1e824
generated_at: 2026-10-14T15:04:02.186784+00:00
model: ollama:qwen3.8:27b
---

# src/modules/api-keys/tests/integration/revoked-by-account.test.ts

## Purpose

Integration test proving that the `account` module actually emits the `sessions-revoked` event at the points where a security epoch moves (logout-all, password reset, email-change-undo), and that this revokes previously minted API keys. It is the complement to `api-keys.test.ts`, which covers the event *handling*; this file covers the event *emission*.

## Key elements

- **`FRONTEND`** – The single allowed CORS origin (`https://shop.example`) for this file's requests.
- **`adminWithKey()`** – Shared fixture: creates a verified admin user, mints a 7-day API key scoped to `apikeys.any.read`, logs in via HTTP, and returns the user, a bearer token, and the key's secret.
- **`describe("keys end with the sessions that may be compromised")`** – Five test cases:
  - `logout-all` → key is revoked.
  - `reset-confirm` (password reset) → key is revoked.
  - `email-change-undo` (not-mine report) → key is revoked.
  - Replayed refresh token (grace = 0, treated as theft) → all sessions die, but the key **survives** (a key is a deliberate act, not a browser artifact).
  - Ordinary `password` change (owner proves current password) → key **survives**.

## Relationships

- **`@modules/api-keys/module`** – Invoked via `apiKeysModule.onRegistered?.()` to install the credential resolver, mirroring real boot.
- **`@modules/api-keys/services/api-keys`** – `mint()` is called directly (bypassing HTTP) to create the key under test.
- **`@tests/credentials`** – `credentialOf(secret)` is the assertion helper that checks whether a key still exists in the database.
- **`@kernel/outbox`** – `settleOutboxNudges()` flushes the async outbox relay after each security action; without it the revocation event has not yet been delivered.
- **`@kernel/access/tenant` / `@kernel/permissions`** – Supply `DEPLOYMENT_TENANT_ID` and `permissionsOfRole('admin')` for constructing the `TenantCallerContext` passed to `mint`.
- **`@modules/users/tests/factories`** – Provides `createUser`, `userRepository`, and the fixed `PLAIN_PASSWORD` / `REPLACEMENT_PASSWORD` constants.
- **`@modules/account/tests/factories`** – `plantToken` seeds one-time tokens (reset, email-change-undo); `sessionRowsOf` asserts session state after a replayed-refresh scenario.
- **`@tests/http`, `@tests/cookies`, `@tests/setup-test-db`, `@tests/environment`** – Standard test-infra: HTTP client, cookie extraction, DB lifecycle, and env-var overrides (e.g., `NODE_TOKEN_ROTATION_GRACE_MS`).

## Notes

- The test file does **not** assert on the shape of the `sessions-revoked` event or on the API-key handler logic; those belong to `api-keys.test.ts`. Keep new emission-coverage here and handling-coverage there.
- Every revocation assertion is preceded by `settleOutboxNudges()`. The event is committed transactionally and delivered asynchronously via the outbox relay—skipping this call will produce false-negative "key still exists" results.
- The replayed-refresh test intentionally sets `NODE_TOKEN_ROTATION_GRACE_MS` to `'0'` to force a theft classification. If the default grace window is restored (or this env is set elsewhere), the replay will succeed and the test's 401 expectation will fail.
- `adminWithKey()` uses a *direct* `mint()` call with a hand-built `TenantCallerContext` rather than going through the HTTP API-key endpoint, so the test isolates the account-event path from key-creation validation.
