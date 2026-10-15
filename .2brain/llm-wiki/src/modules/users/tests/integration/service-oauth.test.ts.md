---
source: src/modules/users/tests/integration/service-oauth.test.ts
sha256: 1110e00b2ebadab0ff1fbb636d80b89a92b9ae89965c8d85e165182a4778e0c5
generated_at: 2026-10-15T12:15:10.117543+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/tests/integration/service-oauth.test.ts

## Purpose

Integration tests for `userService.findByOAuthIdentity`, the first lookup executed on every OAuth callback (see `account/services/oauth.ts`). The tests verify that the method resolves a valid linked account and correctly rejects deactivated, soft-deleted, or nonexistent identities, ensuring a deactivated or deleted user cannot walk into a session simply because an OAuth identity is still linked.

## Key elements

- **`linkIdentity(userId)`** — local helper that calls `userRepository.linkOAuthAccount` with a fixed Google identity (`provider: 'google'`, `providerId: 'subject-1'`), mirroring what a real callback's `linkOAuthAccount` writes.
- **`describe('userService.findByOAuthIdentity')`** — four cases:
  - Resolves the user when provider + providerId match a valid, active account.
  - Returns falsy for a **deactivated** account (`active: false`) whose identity is linked.
  - Returns falsy for a **soft-deleted** account (`deletedAt` set) whose identity is linked.
  - Returns falsy for a provider + providerId nobody holds.

## Relationships

- **`src/modules/users/services/index.ts`** — exports `userService`; the `findByOAuthIdentity` method is the unit under test.
- **`src/modules/users/tests/factories.ts`** — provides `createUser` (seeds users with specified flags) and `userRepository` (used via the `linkIdentity` helper to attach the OAuth identity).
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` is invoked at module top-level to initialise the in-memory test database before any test runs.
- **`src/modules/users/repository.ts`** — the repository whose `linkOAuthAccount` method is exercised through the factory; its query behaviour is what makes the active/deleted filters work.

## Notes

- The top-of-file comment explicitly ties this test suite to the security invariant that `findByOAuthIdentity` must filter identically to `findForLogin`. If `findForLogin` gains a new filter condition, this suite should gain a matching case.
- All four tests share the same fixed identity values (`google` / `subject-1`); there is no parametrisation or provider-variation coverage here.
- `setupTestDb()` runs once at import time (not inside a `beforeAll`), so it executes before the `describe` block is even registered.
