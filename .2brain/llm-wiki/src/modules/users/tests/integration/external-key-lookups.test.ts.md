---
source: src/modules/users/tests/integration/external-key-lookups.test.ts
sha256: f6363358944446f7b7de6ff50c72393ceef6299ef3e14640e7d741fdfcc77b8a
generated_at: 2026-11-14T22:34:04.538926+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/tests/integration/external-key-lookups.test.ts

## Purpose

Integration tests proving that user-lookup queries keyed by external identifiers (email, OAuth subject) reject MongoDB query operators supplied as values, failing with a cast error rather than silently matching every document. The file guards the "Zod is the only thing stopping an injection" assumption at the service layer.

## Key elements

- **`operatorAsString()`** — Returns `JSON.parse('{"$ne": null}')` cast to `string`. The intentional type lie that simulates an unsanitized operator reaching the query path.
- **`CAST_FAILURE`** — Regex (`/Cast to string failed/u`) used in every rejection assertion; the expected failure mode when an object hits the string query path.
- **`describe('external-key lookups')`** — The suite. `beforeEach` seeds a real user plus a linked Google OAuth account, then individual tests exercise:
  - `userRepository.findOne` (raw repo, demonstrating the wide-match *would* happen without the cast guard)
  - `accountUserService.findForLogin`
  - `accountUserService.findByEmail`
  - `accountUserService.emailTaken`
  - `accountUserService.emailOrPendingEmailTaken`
  - `accountUserService.findByOAuthIdentity`
  - A banned-account case confirming login refusal is driven by `active: false`, not the operator guard.

## Relationships

- **`src/modules/users/friends/account.ts`** — Source of `accountUserService`, the service under test; every service-level assertion calls its methods.
- **`src/modules/users/repository.ts`** — Source of `userRepository`; used in the raw-repo "would match" test and in the banned-account `count` assertion.
- **`src/modules/users/tests/factories.ts`** — Provides `createUser` for seeding users (active and banned) in `beforeEach` and individual tests.
- **`tests/support/setup-test-db.ts`** — Called once at module top-level (`setupTestDb()`) to initialise the in-memory test database before any test runs.

## Notes

- The `operatorAsString` cast is deliberately unsound (`any → string`); it is the attack vector being tested, not a production code path. Do not "fix" the cast or the test loses its purpose.
- The first test (`an unsanitized lookup WOULD match everyone…`) asserts the *vulnerability exists at the raw-repo level*; it is not a bug report but a demonstration that the service-layer cast guard is what actually protects the query.
- All service-level tests expect a **rejection** (`.rejects.toThrow`), not a `null` return — the DB layer throws before returning a wrong result.
