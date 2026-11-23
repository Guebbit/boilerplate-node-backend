---
source: src/modules/products/tests/integration/delete-titles.test.ts
source_sha256: 89edd782a53329b63fb2ac8e0c087e5f3d9fada6c8cea86e61579079c4074545
context_sha256: 09794205847705af132bb8b363f0bb30c2590a21f3c7c1e7e6a0d6b7db1c6507
generated_at: 2026-11-22T07:16:14.896256+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/products/tests/integration/delete-titles.test.ts

## Purpose
Integration tests for what the `product.deleted` domain event carries: the product's titles by locale, read before a hard delete removes the translation rows. Consumers that outlive the product (e.g. `notifications`) can only quote what travelled with the event, so a missing title can never be shown later. The file also covers `productService.titlesById`.

## Key elements
- `jest.mock('@kernel/translation', ...)`: replaces `readAllTranslations`, `readServedTranslations` and `removeTranslations` with `jest.fn` wrappers around the real implementations. They are recording wrappers rather than `jest.spyOn` spies, because `spyOn` cannot redefine the non-configurable property a CommonJS namespace import exposes under the swc transform.
- `afterEach`: resets each wrapper and restores the real implementation, so a stub from one case doesn't leak into the next.
- `describe('product.deleted titles')`: `beforeEach` calls `resetDomainEvents()`, `markDomainEventsWired()` and subscribes a `deleted` mock to `PRODUCT_DELETED`. Cases:
  - A hard delete emits `{ productId, hardDelete: true, titles: { en: 'Blue mug' } }`.
  - A soft delete emits the same shape with `hardDelete: false`.
  - `readServedTranslations` is called before `removeTranslations` (recorded in an `order` array). The event's titles are `{ en, it }`.
  - A repeated soft delete of an already-deleted product emits nothing.
- `describe('productService.titlesById')`:
  - It returns the names of an existing product, soft-deleted ones included.
  - It returns `{}` for a product that has been hard-deleted.
  - A translated title wins over the product column for its own language.

## Relationships
- `@tests/setup-test-db` (`setupTestDb`): called at module level to set up the test database.
- `@modules/products/tests/factories` (`createProduct`): creates the products under test.
- `../../services` (`productService`): `removeById(id, hardDelete)` and `titlesById(id)` are the code under test.
- `../../events` (`PRODUCT_DELETED`): the event name the tests subscribe to.
- `@kernel/events`: `onDomainEvent`, `resetDomainEvents` and `markDomainEventsWired` control and observe event dispatch.
- `@kernel/outbox`: `settleOutboxNudges()` is awaited after each action so the event is delivered before assertions run.
- `@kernel/translation`: mocked as described above to verify call order and to inject served translations.

## Notes
- Event handlers are called with a second argument, matched with `expect.anything()`.
- `markDomainEventsWired()` is needed because the relay only dispatches in a process where modules have subscribed.
- Cases that stub `readServedTranslations` use `mockImplementation` or `mockResolvedValueOnce`. The `afterEach` restores the real behavior.
