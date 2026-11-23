---
source: src/modules/cart/analytics.ts
generated_at: 2026-11-22T04:29:26.007768+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/cart/analytics.ts

## Purpose
Declares the analytics event names the cart module emits and registers them into the analytics port's app-wide event-name union. Checkout events live here rather than in `orders` because `POST /cart/checkout` is the endpoint that reports them ("a name belongs to the code that emits it"). The file's header points to a naming rule in a linked docs page (`analytics.md`, `#naming`).

## Key elements
- `cartAnalyticsEvents` — `as const` object mapping intent keys to snake_case event names:
  - Cart: `CART_VIEWED` (`cart_viewed`), `CART_ITEM_ADDED`, `CART_ITEM_UPDATED`, `CART_ITEM_REMOVED`, `CART_CLEARED`.
  - `CART_REORDERED` (`cart_reordered`) — `POST /cart/reorder`; treated as a cart event, not an orders one, since the order is only read and the cart is what changes.
  - Checkout: `CHECKOUT_COMPLETED` (`checkout_completed`), `CHECKOUT_FAILED` (`checkout_failed`).
- `declare module '@infrastructure/observability/analytics'` — augments `AnalyticsEventMap` with a `cart` key whose type is the union of the values of `cartAnalyticsEvents`.

## Relationships
- `src/modules/cart/services/checkout.ts`, `src/modules/cart/services/items.ts`, and `src/modules/cart/services/reorder.ts` are the cart services adjacent to this file in the graph. Their names line up with the checkout, item, and reorder events defined here.
- `src/modules/cart/tests/integration/analytics-consent.test.ts`, `src/modules/cart/tests/integration/merge-atomic.test.ts`, and `src/modules/cart/tests/integration/merge-effects.test.ts` are related integration tests.
- `tests/unit/infrastructure/observability/analytics.test.ts` is the unit test for the analytics port this file augments.

## Notes
- Adding an event: add it to `cartAnalyticsEvents`. The union type updates automatically through the module augmentation.
- The file's header says audit actions are declared with the same augmentation pattern, so the catalogue grows with the modules that own their names.
- The file contains only constants and a type declaration, with no runtime behavior.
