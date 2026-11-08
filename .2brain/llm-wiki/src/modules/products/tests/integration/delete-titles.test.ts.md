---
source: src/modules/products/tests/integration/delete-titles.test.ts
sha256: b3d323ca1f1ab703e59b1da2fe4a12d6845f0357deb1ef6dbe4443ba79f8820f
generated_at: 2026-11-08T07:51:11.706699+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/tests/integration/delete-titles.test.ts

## Purpose

Integration tests verifying that the `product.deleted` domain event carries the product's titles (by locale) captured **before** translation rows are hard-deleted, and that `productService.titlesById` returns correct results for soft-deleted vs. hard-deleted products. Ensures downstream consumers (e.g. notifications) can still display a product's names after it no longer exists.

## Key elements

- **`describe('product.deleted titles')`** — Four cases: fallback-language title on hard delete, title on soft delete, read-before-remove ordering (multi-locale), and idempotency (no second event on repeated soft delete).
- **`describe('productService.titlesById')`** — Three cases: soft-deleted product still resolves titles, hard-deleted product returns an empty map, and a translated title overrides the product column for the same locale.
- **`jest.mock('@kernel/translation')`** — Replaces the three port methods (`readAllTranslations`, `readServedTranslations`, `removeTranslations`) with `jest.fn(actual.…)` wrappers so they record calls while still executing the real logic.
- **`afterEach`** — Resets all three mocked translation functions back to their real implementations to prevent cross-test leakage.
- **`beforeEach` (first describe)** — Calls `resetDomainEvents()`, `markDomainEventsWired()`, and subscribes the `deleted` spy to `PRODUCT_DELETED`.

## Relationships

- **`src/kernel/events.ts`** — Imports `markDomainEventsWired`, `onDomainEvent`, `resetDomainEvents` to control the in-process event relay lifecycle.
- **`src/kernel/outbox.ts`** — Imports `settleOutboxNudges` to flush async outbox work before asserting on event payloads.
- **`src/kernel/translation.ts`** — Mocked at module level; tests assert call order (`read` → `remove`) and inspect returned `Map<locale, {title}>` shapes.
- **`src/modules/products/events.ts`** — Imports the `PRODUCT_DELETED` constant used as the subscription key.
- **`src/modules/products/services/index.ts`** — The system under test: `productService.removeById(id, hardDelete)` and `productService.titlesById(id)`.
- **`src/modules/products/tests/factories.ts`** — `createProduct` builds a seeded product row for each case.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` initialises the test database before any test runs.

## Notes

- The translation mock uses **recording wrappers around real implementations** (not pure spies) because `jest.spyOn` cannot redefine the non-configurable property exposed by a CommonJS namespace import under the swc transform used in CI.
- `markDomainEventsWired()` is required in `beforeEach`; without it the relay silently drops events (it only dispatches in a process where at least one subscriber has registered).
- Every assertion on the event payload must come **after** `settleOutboxNudges()`, since `removeById` enqueues the event asynchronously via the outbox.
- The `afterEach` reset is load-bearing: a stub left on `readServedTranslations` by one test case would answer the next case's real reads with stale data.
