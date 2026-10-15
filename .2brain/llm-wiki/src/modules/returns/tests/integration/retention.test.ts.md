---
source: src/modules/returns/tests/integration/retention.test.ts
sha256: 1eed3970d787c690235a1de399eb3e5d8ddf9cd2fd70cf4710593b02ee18e18a
generated_at: 2026-10-15T12:00:22.262900+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/tests/integration/retention.test.ts

## Purpose

Integration tests for the `reap:returns` retention job. Verifies against a real database that `scrubReturnText` removes only the free-text fields (`note`, `declineReason`) on returns whose `updatedAt` falls outside the configured window, leaves all other fields intact, is idempotent on re-run, and respects an explicit cutoff passed to the repository.

## Key elements

- **`returnAged(ageDays)`** — builds a complete return document (user, product, delivered order, both text fields populated) and then overwrites `updatedAt` to a date `ageDays` in the past. Returns `{ id, updatedAt }` for assertions.
- **`stored(id)`** — thin wrapper around `returnModel.findById(id).lean()` to read the raw stored document.
- **`describe('scrubReturnText')`** — six cases covering: both texts removed past the window, texts preserved inside the window, single-text variants, idempotent re-run (returns 0), and the repository's `scrubFreeTextBefore(cutoff)` method with explicit dates.

## Relationships

- **`src/modules/returns/services/retention.ts`** — source of `scrubReturnText`, the function under test.
- **`src/modules/returns/model.ts`** — `returnModel` used to create, update, and read return documents directly.
- **`src/modules/returns/repository.ts`** — `returnRepository.scrubFreeTextBefore(cutoff)` exercised in the last test case.
- **`src/modules/users/tests/factories.ts`** — `createUser` to seed the customer.
- **`src/modules/products/tests/factories.ts`** — `createProduct` to seed the product.
- **`src/modules/orders/tests/factories.ts`** — `createOrder` / `toOrderItem` to seed the parent order.
- **`src/types/index.ts`** — `OrderStatus.delivered` enum value.
- **`tests/support/setup-test-db.ts`** — `setupTestDb` called at module top to connect the real DB.
- **`tests/support/environment.ts`** — `setEnvironment` used in `beforeEach` to set `NODE_RETURN_TEXT_RETENTION_DAYS=30`.

## Notes

- `updatedAt` is set by hand with `timestamps: false` so Mongoose does not overwrite the test-controlled timestamp on the subsequent `updateOne`.
- A module-level `customers` counter guarantees unique e-mail addresses across tests in a shared DB.
- Tests are true integration tests: they run against a real database (not mocks), so they depend on `setupTestDb` completing before any query executes.
