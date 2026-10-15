---
source: src/modules/cart/tests/integration/service.test.ts
sha256: 5757be171c7ff8ffbe3e703260f6f102a1eed766caa207d06807b4d9a7697df4
generated_at: 2026-10-15T10:25:08.620445+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/tests/integration/service.test.ts

## Purpose

Integration tests for the cart service layer (`src/modules/cart/services/`). Runs against a real MongoDB instance (`setupTestDb`) to exercise behaviour that only lives in repository guarded writes — specifically the `set` vs `add` distinction (shared `upsertCartItem` differing by `$set` vs `$inc`), the over-serialization contract on the cart view, the per-user cart document shape (no per-line `_id`), live shipping pricing, and the checkout/order-confirmation flow.

## Key elements

- **`mockEnqueueEmail`** – Jest mock of `@infrastructure/adapters/mailer#enqueueEmail`; the only thing mocked. The test asserts dispatch happened, not message content.
- **`flush()`** – `setImmediate`-based await to drain the fire-and-forget `sendOrderPlacedEmail` chain before asserting on the mailer mock.
- **`EMPTY_CART`** – canonical expected shape for a user with no items (zeroed summary, `shipping.required: false`).
- **`storedQuantity(userId, productId)`** – reads the persisted quantity straight from `cartRepository.findByUserId` so assertions survive the Mongo round-trip.
- **`atDefault` / `atHardCap`** – run a test body with `NODE_CART_LINE_MAX` pinned to `10` or `999` respectively, isolating from the developer's own `.env`.
- **`giveUserAnAddress(userId)`** – seeds a default address via `addressAdd` so `standard`/`express` shipping rules are satisfied without every case setting it up.
- **`describe('cart storage')`** – absence-before-write, cart creation on first add, `createdAt` stamp, no per-line `_id`, single-document invariant, `updatedAt` refresh.
- **`describe('cartGet')`** – empty cart, missing user, populated product on each line, product-`null` after deletion while `productId` is preserved.
- **`describe('cartGetForBadge')`** – over-serialization guard (exactly `productId`, `quantity`, `availability` keys), multi-line summary math, empty-cart summary.
- **`describe('shipping (FA-D6/B3)')`** – all-digital basket, free-above-threshold pricing, stored-method re-validation on read.
- *(File continues with further `describe` blocks covering checkout, order confirmation, `productRemoveFromCartsById`, etc.)*

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/modules/cart/services/` (index) | Unit under test: imports `cartGet`, `cartGetForBadge`, `cartItemSetById`, `cartItemAddById`, `cartItemRemoveById`, `cartRemove`, `cartShippingMethodSet`, `orderConfirm`, `cartService`, `productRemoveFromCartsById`. |
| `src/modules/cart/repository.ts` | Direct DB assertions (`findByUserId`, `count`) and the code whose guarded writes the tests exist to pin. |
| `src/modules/cart/services/items.ts` | The `set`/`add` seam (`upsertCartItem`); the file's docblock names it as the highest-risk line. |
| `src/modules/cart/services/checkout.ts` | Exercise via `orderConfirm` and the checkout-module registration. |
| `src/modules/cart/services/cleanup.ts` | Exercised via `productRemoveFromCartsById` (product-deletion → cart line removal). |
| `src/modules/cart/module.ts` | Imported for module registration in test setup. |
| `src/infrastructure/adapters/mailer.ts` | Mocked; asserted to receive exactly one `enqueueEmail` on order confirmation. |
| `src/infrastructure/adapters/logger.ts` | Imported (likely spied or silenced during test runs). |
| `src/infrastructure/i18n/index.ts` / `context.ts` | `t` imported for translated-string assertions in error/success messages. |
| `src/kernel/registry.ts` | `registerModules` called to wire the module graph before tests run. |
| `src/kernel/events.ts` | `resetDomainEvents` / `emitDomainEvent` to control and verify domain-event lifecycle (e.g. `PRODUCT_DELETED`). |
| `src/modules/addresses/` | `addressAdd` used as a prerequisite for shipping/checkout cases. |
| `src/modules/account/tests/unit/family-liveness.test.ts` | Sibling test that shares conventions (factory pattern, `asCustomer` caller context). |

## Notes

- **Real Mongo, not mocks.** The docblock is explicit: a mock cannot exercise the guarded write logic in `cartRepository.upsertLine`, so `setupTestDb()` provides a live instance. Only the mailer is mocked.
- **`set` vs `add` is the critical distinction.** Both funnel through one private `upsertCartItem`; the sole difference is `$set` (absolute quantity) vs `$inc` (delta). A regression that collapses them is invisible in code review and silently multiplies or zeroes a user's quantity.
- **No per-line `_id`.** `CartItem` is `additionalProperties: false`; the test asserts the persisted line is exactly `{ productId, quantity }`. A Mongoose-generated subdocument `_id` would violate the API contract.
- **`cartGet` vs `cartGetForBadge` differ in serialization.** `cartGet` includes the populated `product`; `cartGetForBadge` must not. The badge variant's keys are asserted to be *exactly* `['productId', 'quantity', 'availability']`.
- **Environment pinning.** `atDefault`/`atHardCap` wrap test bodies so a developer's local `.env` value for `NODE_CART_LINE_MAX` cannot shift the expected boundary.
- **Fire-and-forget email.** `flush()` must be called before asserting on `mockEnqueueEmail`; the `sendOrderPlacedEmail` chain is async and not awaited by the caller.
