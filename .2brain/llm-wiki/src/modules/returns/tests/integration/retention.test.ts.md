---
source: src/modules/returns/tests/integration/retention.test.ts
sha256: 78fad55f0048ca5449e44668b5e0d21ee32b9416f33cc942b2d9a48653b7860a
generated_at: 2026-11-08T08:10:41.491229+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/tests/integration/retention.test.ts

## Purpose

Integration tests (against a real database) for the `reap:returns` retention job. Verifies that `scrubReturnText` removes free-text fields (`note`, `declineMessage`) on returns older than the configured window while preserving structured fields, and that a second run is a no-op.

## Key elements

- **`returnAged(ageDays)`** — helper that creates a full chain (user → product → delivered order → return) and backdates `updatedAt` by the given number of days. Returns the new return's `id` and the stamped `updatedAt`.
- **`stored(id)`** — reads a return document raw (`.lean()`) for assertions.
- **`describe('scrubReturnText')`** — six test cases:
  - Unsets both text fields past the window; keeps reason codes, status, lines, `decidedAt`, `updatedAt`.
  - Leaves text intact when the return is still inside the window.
  - Wipes a return that has only `declineMessage`.
  - Wipes a return that has only `note`.
  - Confirms a second invocation changes nothing (idempotency).
  - Verifies `returnRepository.scrubFreeTextBefore` honours an explicit cutoff date rather than the env-configured one.

## Relationships

- **`src/modules/returns/services/retention.ts`** — under-test target: imports and calls `scrubReturnText()`.
- **`src/modules/returns/repository.ts`** — imports `returnRepository` to exercise the lower-level `scrubFreeTextBefore(cutoff)` API.
- **`src/modules/returns/model.ts`** — imports `returnModel` to create, update, and read return documents directly.
- **`src/modules/orders/tests/factories.ts`** — `createOrder`, `toOrderItem` build the parent order.
- **`src/modules/products/tests/factories.ts`** — `createProduct` builds the product.
- **`src/modules/users/tests/factories.ts`** — `createUser` builds the customer.
- **`src/types/index.ts`** — `OrderStatus` enum for setting order status to `delivered`.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` boots a real database for the suite.
- **`tests/support/environment.ts`** — `setEnvironment()` injects `NODE_RETURN_TEXT_RETENTION_DAYS` per test.

## Notes

- **Real database, not mocks.** The suite calls `setupTestDb()` at module scope; all DB access goes through Mongoose.
- **`updatedAt` backdating.** `returnAged` writes `updatedAt` with `{ timestamps: false }` to prevent Mongoose from re-stamping "now." Test assertions on `updatedAt` depend on this.
- **Unique emails.** A module-level `customers` counter guarantees each `createUser` call gets a distinct address, avoiding factory uniqueness collisions within a single test run.
- **Two entry points tested.** The service-level `scrubReturnText()` (uses env config) and the repository-level `scrubFreeTextBefore(cutoff)` (explicit date) are both exercised; the latter lets a test verify cutoff logic independently of environment variables.
