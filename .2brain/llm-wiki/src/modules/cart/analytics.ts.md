---
source: src/modules/cart/analytics.ts
sha256: 8f4162705d78a7126d07389eee13ded009960346d865fbeeeb4c0ee7a55ebf27
generated_at: 2026-11-08T05:10:46.109997+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/analytics.ts

## Purpose

Declares the analytics event names emitted by the cart module and registers them into the analytics port's app-wide `AnalyticsEventMap`. It exists so that event-name strings live alongside the code that fires them (e.g. checkout events are here because `POST /cart/checkout` is a cart endpoint), giving the module a single source of truth for its telemetry vocabulary.

## Key elements

- **`cartAnalyticsEvents`** — `as const` object mapping intent keys to snake_case event-name strings. Covers cart lifecycle events (`CART_VIEWED`, `CART_ITEM_ADDED`, `CART_ITEM_UPDATED`, `CART_ITEM_REMOVED`, `CART_CLEARED`, `CART_REORDERED`) and the two checkout outcome events (`CHECKOUT_COMPLETED`, `CHECKOUT_FAILED`).
- **`declare module '@infrastructure/observability/analytics'`** — Module augmentation that adds a `cart` key to the shared `AnalyticsEventMap` interface, unioning the values of `cartAnalyticsEvents` into the global event-name type.

## Relationships

- **`src/modules/cart/services/items.ts`** — Emits the cart-lifecycle events (`CART_VIEWED`, `CART_ITEM_*`, `CART_CLEARED`) defined here.
- **`src/modules/cart/services/reorder.ts`** — Emits `CART_REORDERED`.
- **`src/modules/cart/services/checkout.ts`** — Emits `CHECKOUT_COMPLETED` / `CHECKOUT_FAILED`.
- **`src/modules/cart/tests/integration/analytics-consent.test.ts`** — Verifies that these events respect the user's analytics consent setting.
- **`src/modules/cart/tests/integration/merge-effects.test.ts`** — Exercises cart-merge scenarios and asserts the correct analytics events fire.
- **`tests/unit/infrastructure/observability/analytics.test.ts`** — Tests the analytics port (the interface this file augments), confirming the `cart` key is part of the union.

## Notes

- **Ownership rule:** An event name lives in the module that owns the *endpoint* that reports it, not the domain the event conceptually describes. That is why `CHECKOUT_*` is here (cart owns `POST /cart/checkout`) rather than in an `orders` module.
- **Augmentation pattern:** This mirrors `./audit.ts` (audit actions). Adding a new event means adding a key to `cartAnalyticsEvents`; the `declare module` block picks it up automatically via the `(typeof …)[keyof …]` indexed type — no separate list to update.
- **Naming convention** is governed by `docs/tools/analytics.md#naming`; strings are `snake_case`, keys are `SCREAMING_SNAKE_CASE`.
