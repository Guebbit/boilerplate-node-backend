---
source: src/modules/products/tests/integration/delete-titles.test.ts
sha256: b3d323ca1f1ab703e59b1da2fe4a12d6845f0357deb1ef6dbe4443ba79f8820f
generated_at: 2026-10-29T05:32:23.019783+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/tests/integration/delete-titles.test.ts

## Purpose

Integration test verifying that the `product.deleted` domain event carries the product's translated titles (read before a hard delete drops the translation rows), and that `productService.titlesById` resolves correctly for live, soft-deleted, and hard-deleted products. Exists because a message that outlives the product can only display what travelled with the event.

## Key elements

- **`jest.mock('@kernel/translation', …)`** – Replaces the module with `jest.fn` wrappers around the real implementations (not spies), so individual tests can stub `readServedTranslations` / `removeTranslations` to control return values or record call order.
- **`afterEach` block** – Resets and re-implements all three mocked translation functions with their real versions, preventing a stub left by one case from answering the next case's reads.
- **`describe('product.deleted titles')`** – Four tests:
  - Event payload includes the fallback-language title for a hard delete.
  - Event payload includes the title for a soft delete.
  - Translations are read *before* `removeTranslations` is called (order assertion), and all languages appear in the event.
  - A repeated soft-delete on an already-deleted product does **not** re-emit.
- **`describe('productService.titlesById')`** – Three tests:
  - Returns titles for a soft-deleted product.
  - Returns an empty object for a hard-deleted (gone) product.
  - A translated title in the translation store wins over the product column title for the same locale.
- **`setupTestDb()`** – Initialises an in-memory/test database for the suite.

## Relationships

- **`@tests/setup-test-db`** – Provides `setupTestDb` to create the test database the suite runs against.
- **`@modules/products/tests/factories`** – Provides `createProduct` to seed a product with a known title.
- **`@kernel/translation`** – Mocked at module level; tests stub `readServedTranslations` and `removeTranslations` to control return values and assert call ordering.
- **`@kernel/events`** – `resetDomainEvents` / `markDomainEventsWired` / `onDomainEvent` set up the in-process event relay and subscribe a spy to `PRODUCT_DELETED`.
- **`@kernel/outbox`** – `settleOutboxNudges` flushes the async outbox so that event emission (and thus the spy) has completed before assertions run.
- **`@modules/products/events`** – Exports the `PRODUCT_DELETED` constant used to subscribe.
- **`@modules/products/services`** – Exports `productService`; tests call `removeById` and `titlesById`.

## Notes

- **Mock strategy:** `jest.spyOn` is deliberately avoided because the swc transform (used by the mutation runner) exposes CommonJS namespace properties as non-configurable, making spies impossible. The `jest.mock` + `jest.fn(actual)` pattern is the workaround.
- **`markDomainEventsWired()`** must be called in `beforeEach`; without it the event relay refuses to dispatch because no modules have subscribed in that process.
- **`settleOutboxNudges()`** is required after every `removeById` call before asserting on the event spy; the outbox processes asynchronously.
- The ordering test (`read` → `remove`) is the core invariant: if `removeTranslations` ran first, the event would carry empty titles and no downstream notification could ever display the product name.
