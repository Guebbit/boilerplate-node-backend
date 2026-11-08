---
source: src/modules/products/tests/integration/transactional-write.test.ts
sha256: 7b5a20814529320f6a120b5b759ac0cf4c20082b7eaee3cdad26d1c0f61b163b
generated_at: 2026-11-08T07:53:09.900437+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/tests/integration/transactional-write.test.ts

## Purpose

Integration test that proves a product write (create or update) and its translation rows are committed atomically against a real Mongo instance, and that the resulting `product.created` outbox event rides the same transaction. The translation port is replaced with a double whose `write` can be forced to fail, simulating a locales store dying mid-write.

## Key elements

- **`write` (module-level `jest.Mock`)** — stand-in for the translation port's `write` method; swapped per test via `mockRejectedValueOnce` to simulate failure.
- **`beforeEach` / `afterEach`** — register and unregister a full `TranslationPort` double (via `registerTranslationPort`) with a fixed `en` fallback locale and no-op reads.
- **`rowsNamed(name)`** — helper that queries `outboxEventModel` by event name to assert outbox row presence/absence.
- **`describe('productService.create is one transaction')`** — two cases: (1) translation-write failure rolls back both the product row and the outbox row; (2) success commits product, translation, and outbox event together.
- **`describe('productService.create after its commit')`** — verifies that a post-commit re-read failure (`findById` rejection) does not turn the response into an error; the already-committed document is returned as `ResponseSuccess`.
- **`describe('productService.updateById is one transaction')`** — verifies that a failed translation write during update leaves the old row unchanged.

## Relationships

- **`@kernel/translation`** — `registerTranslationPort` injects the double; `afterEach` passes `undefined` to restore.
- **`@kernel/outbox`** — `outboxEventModel` is queried to assert event rows; `settleOutboxNudges` is awaited to let async outbox processing finish before assertions.
- **`@modules/products/services`** — `productService` is the system under test (`create`, `updateById`, `zodProductCreateSchema`).
- **`@modules/products/repository`** — `productRepository.count` and (via spy) `productRepository.findById` are used to verify DB state.
- **`@modules/products/tests/factories`** — `createProduct` / `readProduct` seed and read fixture products.
- **`@modules/products/model`** — `ProductDocument` type imported for casting `ResponseSuccess`.
- **`@infrastructure/http/response`** — `ResponseSuccess` type used to type-assert service results.
- **`@tests/callers`** — `testCallerContext` and `callerContextAs('admin')` supply caller context.
- **`@tests/setup-test-db`** — `setupTestDb()` provisions the real Mongo instance.

## Notes

- This suite runs against **real Mongo**; only the translation port and (in one case) `productRepository.findById` are mocked.
- `settleOutboxNudges()` must be awaited after a successful create before asserting outbox rows — the outbox write is asynchronous relative to the main transaction.
- The post-commit re-read test uses `jest.spyOn` + `jest.restoreAllMocks()` inline rather than the per-test `write` swap, because it targets the repository layer, not the port.
- `FALLBACK` is hard-coded to `'en'`; the test file's doc comment notes this matches every environment the suite runs in.
