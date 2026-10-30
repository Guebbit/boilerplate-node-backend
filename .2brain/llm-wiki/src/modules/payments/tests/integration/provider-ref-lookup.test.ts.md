---
source: src/modules/payments/tests/integration/provider-ref-lookup.test.ts
sha256: e680e000c819772442b8aa0561f55e8a90127e91a7f49e25ba3d6b7305d7f51b
generated_at: 2026-10-29T05:17:47.985589+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/tests/integration/provider-ref-lookup.test.ts

## Purpose

Integration test that guards against MongoDB operator-object injection into `paymentRepository.findByProviderRef`. It proves the repository's cast validation rejects a payload like `{"$ne": null}` even when a caller has already smuggled it through the webhook port's parse step and type assertions.

## Key elements

- **`describe('paymentRepository.findByProviderRef')`** – single suite, one case.
- **`it('fails the cast on an operator instead of matching every payment')`** – constructs a MongoDB `$ne` operator via `JSON.parse`, forcibly casts it `as string`, passes it to `findByProviderRef`, and asserts the promise rejects with `/Cast to string failed/u`.

## Relationships

- **`src/modules/payments/repository.ts`** – exports `paymentRepository`; this test exercises its `findByProviderRef` method directly (bypassing the webhook port to test the cast boundary in isolation).
- **`tests/support/setup-test-db.ts`** – provides `setupTestDb`, called once at module load to seed an in-memory/ephemeral database for the integration run.

## Notes

- The `as string` cast is deliberate (documented in the inline comment) to simulate a `JSON.parse` result typed as `any` that a caller can coerce—this is the "lie" the test is validating against.
- Lives under `tests/integration/` because it requires a real database; it is not a pure unit test.
- The `@module` doc comment frames the security scenario: the guard must hold *past* the webhook port's parse, not only at the HTTP boundary.
