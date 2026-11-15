---
source: src/modules/users/tests/integration/service-oauth.test.ts
sha256: 3683ce90eff069693d77deb672d599950c4807b3cf101db6ff463c1a866315bc
generated_at: 2026-11-14T22:38:12.241363+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/tests/integration/service-oauth.test.ts

## Purpose

Integration test for `accountUserService.findByOAuthIdentity` — the first lookup `account/services/oauth.ts` runs on every OAuth callback. It verifies that the identity lookup applies the same liveness filter as `findForLogin`: a deactivated or soft-deleted account must **not** resolve, even if an OAuth identity is linked to it, because resolving would let a stale identity walk straight into a session.

## Key elements

- **`linkIdentity(userId)`** — local helper that writes a fixed OAuth link (`provider: 'google'`, `providerId: 'subject-1'`) onto the given user via `userRepository.linkOAuthAccount`, mimicking the shape a real callback's `linkOAuthAccount` call produces.
- **`describe('accountUserService.findByOAuthIdentity')`** — four integration cases:
  - Resolves the correct account when a linked identity matches an active user.
  - Returns falsy for a deactivated (`active: false`) account that still has the identity linked.
  - Returns falsy for a soft-deleted (`deletedAt` set) account that still has the identity linked.
  - Returns falsy when no account holds the queried identity at all.

## Relationships

- **`src/modules/users/friends/account.ts`** — provides `accountUserService`, the service under test.
- **`src/modules/users/tests/factories.ts`** — provides `createUser` (seeds test users with configurable `active`/`deletedAt`) and `userRepository` (used to call `linkOAuthAccount`).
- **`src/modules/users/repository.ts`** — the underlying repository whose `linkOAuthAccount` method is exercised through the factory's `userRepository`.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` is called at module top level to create a fresh integration-test database before any test runs.

## Notes

- `setupTestDb()` is invoked **at module scope**, not inside a `beforeAll` hook. This is the codebase convention for integration tests that need a per-file clean DB.
- All four tests reuse the same `providerId: 'subject-1'`; this is safe because each test creates its own user in an isolated test DB, but it means the tests cannot be parallelised against a shared database.
- The file's leading docblock explicitly ties the filter expectation to `findForLogin`. If `findForLogin`'s liveness rules change, these tests are the guard that the OAuth identity lookup stays in sync.
