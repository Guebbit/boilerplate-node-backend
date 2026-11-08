---
source: src/modules/payments/tests/integration/provider-ref-lookup.test.ts
sha256: e680e000c819772442b8aa0561f55e8a90127e91a7f49e25ba3d6b7305d7f51b
generated_at: 2026-11-08T07:33:36.270106+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/tests/integration/provider-ref-lookup.test.ts

## Purpose

Integration test that guards against MongoDB operator-injection (e.g. `{"$ne": null}`) reaching the provider-reference lookup. It asserts that `findByProviderRef` rejects a non-string operator object rather than silently matching every payment, covering the case where a caller bypasses the webhook port's type parsing and passes a `JSON.parse`-derived `any` cast to `string`.

## Key elements

- **`describe('paymentRepository.findByProviderRef')`** — single test block scoped to the repository method under test.
- **`it('fails the cast on an operator instead of matching every payment')`** — constructs `JSON.parse('{"$ne": null}') as string` (deliberate type lie simulating an untrusted boundary), calls `paymentRepository.findByProviderRef`, and asserts the promise rejects with a message matching `/Cast to string failed/u`.
- **`setupTestDb()`** — called at module level before the suite runs to provision a clean test database.

## Relationships

- **`src/modules/payments/repository.ts`** — imports `paymentRepository`; this file is the sole consumer under test. The repository is expected to perform a runtime string-cast guard and throw if the value is not a genuine string.
- **`tests/support/setup-test-db.ts`** — imports and invokes `setupTestDb()` once at the top of the module to initialize the test database before any assertions execute.

## Notes

- The `as string` cast is an intentional, documented type lie that reproduces the exact shape an attacker could produce at a `JSON.parse` boundary. Do not "fix" it by removing the cast — that would weaken the test.
- The test runs at the **integration** level (real repository + real DB), not the unit level; it depends on `setupTestDb` providing a reachable database.
- The regex `/Cast to string failed/u` is the contract: any change to the repository's error wording must keep this pattern in sync.
