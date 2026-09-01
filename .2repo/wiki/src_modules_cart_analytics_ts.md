# src/modules/cart/analytics.ts

## Purpose

Declares the catalogue of analytics event names that the cart module emits and registers them into the analytics port's app-wide `AnalyticsEventMap` union. It exists so that every cart-related event name is co-located with the module that fires it, following the rule that "a name belongs to the code that emits it."

## Key elements

- **`cartAnalyticsEvents`** (exported `as const` object) — Maps intent keys (`CART_VIEWED`, `CART_ITEM_ADDED`, `CART_ITEM_UPDATED`, `CART_ITEM_REMOVED`, `CART_CLEARED`, `CART_REORDERED`, `CHECKOUT_COMPLETED`, `CHECKOUT_FAILED`) to their snake-case string values.
- **`declare module '@infrastructure/observability/analytics'`** — Augments the `AnalyticsEventMap` interface with a `cart` key typed as the union of all values in `cartAnalyticsEvents`, making the names type-safe at every emit site.

## Relationships

- **`src/modules/cart/services/checkout.ts`** — Emits `CHECKOUT_COMPLETED` and `CHECKOUT_FAILED` via the `POST /cart/checkout` endpoint; the names live here because this module owns that endpoint.
- **`src/modules/cart/services/items.ts`** — Emits `CART_ITEM_ADDED`, `CART_ITEM_UPDATED`, `CART_ITEM_REMOVED`, and `CART_CLEARED`.
- **`src/modules/cart/services/reorder.ts`** — Emits `CART_REORDERED` on `POST /cart/reorder/{orderId}`.
- **`tests/unit/infrastructure/observability/analytics.test.ts`** — Asserts that the registered event names are well-formed and consistent with the naming convention.

## Notes

- `CHECKOUT_COMPLETED` / `CHECKOUT_FAILED` intentionally live in the *cart* module, not in an `orders` module, because the cart endpoint is what reports them. Removing this module removes those names from the funnel.
- `CART_REORDERED` is a cart event (not an orders event) because the reorder only reads an order; the cart is what mutates.
- Follows the same module-augmentation pattern as `./audit.ts`; new modules add their own `declare module` block rather than editing a central list.
- Naming convention is governed by `docs/tools/analytics.md#naming` (snake_case values, UPPER_SNAKE keys).
