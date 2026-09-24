---
source: src/modules/users/tests/integration/service-oauth.test.ts
sha256: 07b33b0b1b523857f190b12dcde45e1d6ed1225eb3cf3b6fbd46dbe4f81deb70
generated_at: 2026-09-23T19:35:51.429201+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/tests/integration/service-oauth.test.ts

## Purpose

Integration tests for `userService.findByOAuthIdentity`, the first lookup `account/services/oauth.ts` runs on every OAuth callback. The file exists as a regression guard for bug **B24**: the method previously matched on the `oauthAccounts` link alone, so a deactivated or soft-deleted account still resolved and walked straight into a session. These tests assert the lookup is now filtered the same way `findForLogin` already is.

## Key elements

- **`linkIdentity(userId)`** — local helper that writes a fixed Google identity (`provider: 'google'`, `providerId: 'subject-1'`) onto a user via `userRepository.linkOAuthAccount`, mirroring the shape a real callback's `linkOAuthAccount` call produces.
- **`describe('userService.findByOAuthIdentity')`** — four integration cases:
  - Resolves the correct user for a valid provider + providerId pair.
  - Returns falsy for a user with `active: false`.
  - Returns falsy for a user with `deletedAt` set (soft-deleted).
  - Returns falsy for an identity no account holds.

## Relationships

- **`src/modules/users/service.ts`** — source of `userService.findByOAuthIdentity`, the unit under test.
- **`src/modules/users/tests/factories.ts`** — provides `createUser` (test-data factory) and `userRepository` (used to link identities).
- **`src/modules/users/repository.ts`** — underlying data layer; `linkOAuthAccount` and the identity query both operate through the repository defined here.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` is called at module top-level to provision a fresh in-memory/transactional database before any test runs.

## Notes

- `setupTestDb()` is invoked at **module scope**, not inside a `beforeAll`, so it runs once per import and is shared across all tests in the file.
- Negative assertions use `resolves.toBeFalsy()` rather than asserting a specific `null`/`undefined`, keeping the contract loose to the service's public type.
- The helper hardcodes a single provider/subject pair; all four tests reuse `'google'` / `'subject-1'`. Adding a case for a different provider is a one-line change to the `linkIdentity` call or an inline `userRepository.linkOAuthAccount` call.
