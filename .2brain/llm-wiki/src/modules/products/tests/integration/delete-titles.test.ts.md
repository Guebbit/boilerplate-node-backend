---
source: src/modules/products/tests/integration/delete-titles.test.ts
sha256: 35f3aa7f5339bf0cd8aecad761e3a60d5b2566af2f0e7d290a2fa9a86c59ae5f
generated_at: 2026-10-15T11:47:51.661406+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/tests/integration/delete-titles.test.ts

## Purpose

Integration tests that verify the `product.deleted` domain event carries the product's titles (by locale) captured **before** a hard delete removes the translation rows. The guarantee matters because a `notifications` message outliving the product can only display titles that travelled with the event. A secondary block covers `productService.titlesById` behaviour for live, soft-deleted, and hard-deleted products.

## Key elements

- **`describe('product.deleted titles')`** — asserts that `productService.removeById` emits `PRODUCT_DELETED` with the correct `titles` map, for both hard and soft deletes, that translations are read *before* they are removed, and that a repeated soft delete does not re-emit.
- **`describe('productService.titlesById')`** — asserts that `titlesById` returns the locale map for an existing (or soft-deleted) product, an empty object after a hard delete, and lets a translated row override the product column for its own language.
- **`jest.mock('@kernel/translation', …)`** — replaces `readAllTranslations` and `removeTranslations` with `jest.fn` wrappers around the real implementations (recording wrappers, not plain spies) so call order can be inspected.
- **`afterEach` reset** — restores both translation methods to their real implementations so a stub left by one test cannot answer the next test's reads.
- **`setupTestDb()`** — provisions a clean database for the integration run.
- **`createProduct` (factory)** — seeds a product row with a given title.
- **`markDomainEventsWired` / `onDomainEvent(PRODUCT_DELETED, deleted)` / `resetDomainEvents`** — wires a one-shot listener so the test can capture the emitted event payload.
- **`settleOutboxNudges`** — awaits pending outbox flushes so async event dispatch is observable.

## Relationships

- **`src/kernel/translation.ts`** — mocked; the test intercepts `readAllTranslations` and `removeTranslations` to verify call ordering and supply controlled locale maps.
- **`src/kernel/events.ts`** — provides the domain-event bus (`onDomainEvent`, `markDomainEventsWired`, `resetDomainEvents`) used to subscribe to and assert on `PRODUCT_DELETED`.
- **`src/kernel/outbox.ts`** — `settleOutboxNudges` is awaited after every `removeById` call to ensure the outbox has flushed the event.
- **`src/modules/products/events.ts`** — supplies the `PRODUCT_DELETED` constant used as the subscription key.
- **`src/modules/products/services/index.ts`** — source of `productService`, whose `removeById` and `titlesById` are the units under test.
- **`src/modules/products/tests/factories.ts`** — provides `createProduct` to seed fixture data.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` initialises the shared test database at module scope.

## Notes

- The translation mock intentionally wraps the real functions rather than using `jest.spyOn`. The comment in the file explains that under the swc transform used by the mutation runner, the CommonJS namespace import exposes a non-configurable property that `jest.spyOn` cannot redefine.
- Every test that mutates a product's translations must `await settleOutboxNudges()` before asserting on the captured event; without it the assertion races the async outbox flush.
- `titlesById` is a read path that works for soft-deleted products (rows still present) but returns `{}` after a hard delete (translation rows gone). The "translated wins over column" test is the only place that overrides `readAllTranslations` to return a different title than the seeded one.
