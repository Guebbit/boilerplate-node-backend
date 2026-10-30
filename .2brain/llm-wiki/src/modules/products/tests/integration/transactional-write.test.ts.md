---
source: src/modules/products/tests/integration/transactional-write.test.ts
sha256: 3ac3ee502aa012fe8816f3b5ffc9f416c7706de000715fb67a7c11624a3449cc
generated_at: 2026-10-29T05:34:08.133276+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/tests/integration/transactional-write.test.ts

## Purpose

Integration test that verifies product `create` and `updateById` are single transactions: the product document, its translation rows, and the outbox event either all commit or all roll back. Runs against a real Mongo instance while replacing only the translation port with a controllable double.

## Key elements

- **`write` (mutable `jest.Mock`)** — stands in for the translation port's `write` method; swapped per test to simulate a mid-write failure.
- **`rowsNamed(name)`** — helper that queries `outboxEventModel` by event name and returns lean rows.
- **`describe('productService.create is one transaction')`** — two cases: (1) translation write rejects → no product row, no `product.created` outbox row; (2) happy path → product, translation write (1×), and outbox row all present with correct `aggregateId`/`payload`.
- **`describe('productService.create after its commit')`** — spies `productRepository.findById` to reject once *after* the transaction commits; asserts the API response still succeeds and the row is durable.
- **`describe('productService.updateById is one transaction')`** — pre-creates a product, forces translation write to fail, asserts the old row is unchanged.

## Relationships

| Neighbor | Interaction |
|---|---|
| `tests/support/setup-test-db.ts` | `setupTestDb()` spins up the real Mongo connection for the whole suite. |
| `tests/support/callers.ts` | `testCallerContext` / `callerContextAs('admin')` supply the auth context passed to service calls. |
| `src/kernel/translation.ts` | `registerTranslationPort` injects the port double; `undefined` in `afterEach` clears it. |
| `src/kernel/outbox.ts` | `outboxEventModel` queried to assert outbox rows; `settleOutboxNudges` flushes pending outbox work before assertions. |
| `src/modules/products/services/index.ts` | `productService.create` / `.updateById` are the system under test; `zodProductCreateSchema.parse` validates input. |
| `src/modules/products/repository.ts` | `productRepository.count` / `.findById` used to verify DB state and to spy on the post-commit re-read. |
| `src/modules/products/tests/factories.ts` | `createProduct` seeds a product for the update test; `readProduct` reads it back for assertions. |
| `src/infrastructure/http/response.ts` | `ResponseSuccess<ProductDocument>` type-casts the service result. |
| `src/modules/products/model.ts` | `ProductDocument` type only. |

## Notes

- The translation port is a **hand-built double**, not a jest mock of the real port class; only its `write` method is swappable. All other port methods resolve to empty/identity values.
- `FALLBACK` is hard-coded to `'en'` and is assumed to match the port's `plan()` output; changing the port's locale config would break the suite.
- The post-commit test deliberately does **not** assert on the response body content beyond `success === true`; the contract under test is "commit succeeded → caller gets a 200, even if the read-back nicety fails."
- `jest.restoreAllMocks()` is called inline in that one test rather than in a global `afterEach`; if new spy-based tests are added, prefer a global cleanup to avoid leaks.
