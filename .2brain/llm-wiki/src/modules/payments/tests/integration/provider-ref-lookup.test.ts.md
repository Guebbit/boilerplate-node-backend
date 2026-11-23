---
source: src/modules/payments/tests/integration/provider-ref-lookup.test.ts
source_sha256: e680e000c819772442b8aa0561f55e8a90127e91a7f49e25ba3d6b7305d7f51b
context_sha256: 1383bd181cd686f0e668b832743ba55d963c32c9a6e60e8cbe7cc647630a7745
generated_at: 2026-11-22T06:58:11.057890+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/payments/tests/integration/provider-ref-lookup.test.ts

## Purpose
Integration test guarding `paymentRepository.findByProviderRef` against NoSQL-operator injection. It verifies that if an operator object (e.g. `{"$ne": null}`) reaches the lookup in place of a provider-reference string, the lookup throws a cast error rather than matching every payment. It covers the case where a caller bypasses the webhook port's parsing.

## Key elements
- `setupTestDb()` — called at module level to prepare the test database for the suite.
- `describe('paymentRepository.findByProviderRef')` — contains the single test, "fails the cast on an operator instead of matching every payment".
- The test builds `operator` with `JSON.parse('{"$ne": null}') as string`. The `as string` cast is deliberate, to get past the type system. It then asserts that `findByProviderRef(operator)` rejects with an error matching `/Cast to string failed/u`.

## Relationships
- `src/modules/payments/repository.ts` — supplies `paymentRepository`, whose `findByProviderRef` is the method under test.
- `tests/support/setup-test-db.ts` — supplies `setupTestDb`, imported via the `@tests/setup-test-db` alias, which handles test DB setup.

## Notes
- The test passes only if the lookup rejects with a "Cast to string failed" error. The assertion therefore relies on that error message, so a change in how the repository or its driver words the cast error could break it.
- The `as string` cast is intentional, as the inline comment notes, because `JSON.parse` returns `any`.
