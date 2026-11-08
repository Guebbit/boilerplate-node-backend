---
source: src/modules/users/tests/integration/service-oauth.test.ts
sha256: 1110e00b2ebadab0ff1fbb636d80b89a92b9ae89965c8d85e165182a4778e0c5
generated_at: 2026-11-08T08:56:55.752606+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/tests/integration/service-oauth.test.ts

## Purpose

Integration tests for `userService.findByOAuthIdentity`, the case-1 lookup that `account/services/oauth.ts` runs on every OAuth callback. The suite verifies that the method not only matches on provider + providerId but also applies the same `active` / `deletedAt` guards as `findForLogin`, so that a deactivated or soft-deleted account cannot walk straight into a session simply because it still has a linked OAuth row.

## Key elements

- **`linkIdentity(userId)`** – local helper that writes a fixed Google identity (`provider: 'google'`, `providerId: 'subject-1'`, `connectedAt: new Date()`) via `userRepository.linkOAuthAccount`, mirroring what a real callback's `linkOAuthAccount` call produces.
- **`describe('userService.findByOAuthIdentity')`** – four cases:
  - Positive: returns the account whose linked identity matches.
  - Deactivated (`active: false`): resolves falsy despite the linked row.
  - Soft-deleted (`deletedAt` set): resolves falsy despite the linked row.
  - Unknown identity: resolves falsy.

## Relationships

- **`src/modules/users/services/index.ts`** – exports `userService`; the method under test is `userService.findByOAuthIdentity`.
- **`src/modules/users/tests/factories.ts`** – supplies `createUser` (test fixture) and `userRepository` (used by `linkIdentity` to seed the linked OAuth row).
- **`src/modules/users/repository.ts`** – the repository behind `userRepository.linkOAuthAccount`; the test exercises the real query path rather than a mock.
- **`tests/support/setup-test-db.ts`** – `setupTestDb()` is called at module top-level to provision the integration-test database before any test runs.

## Notes

- `setupTestDb()` is invoked at the top of the module (not inside `beforeAll`), so the DB is ready before the test runner loads the file.
- All tests share the same fixed identity pair (`google` / `subject-1`); there is no parameterization. If you add a new case, keep the pair consistent to avoid cross-test collisions on the shared DB.
- The file-level JSDoc explicitly cross-references `findForLogin`'s filtering as the intended behaviour contract; a regression here means the OAuth callback path bypasses the same guards the login path enforces.
