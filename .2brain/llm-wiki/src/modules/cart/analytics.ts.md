---
source: src/modules/cart/analytics.ts
sha256: 8f4162705d78a7126d07389eee13ded009960346d865fbeeeb4c0ee7a55ebf27
generated_at: 2026-10-29T03:19:34.234837+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/analytics.ts

## Purpose

Declares the analytics event name constants for the cart module and registers them into the app-wide `AnalyticsEventMap` via TypeScript declaration merging. It exists so that every cart-related analytics event is typed, discoverable in one place, and co-located with the code that owns the names (the cart module), following the same pattern as `./audit.ts`.

## Key elements

- **`cartAnalyticsEvents`** (exported, `as const`) — The full catalogue of event names the cart module can emit:
  - Cart lifecycle: `CART_VIEWED`, `CART_ITEM_ADDED`, `CART_ITEM_UPDATED`, `CART_ITEM_REMOVED`, `CART_CLEARED`
  - Reorder: `CART_REORDERED` (emitted by `POST /cart/reorder`)
  - Checkout outcomes: `CHECKOUT_COMPLETED`, `CHECKOUT_FAILED` (emitted by `POST /cart/checkout`; kept here rather than in `orders` because the emitting endpoint is cart)
- **`declare module '@infrastructure/observability/analytics'`** — Augments the `AnalyticsEventMap` interface with a `cart` key typed as the union of all values in `cartAnalyticsEvents`. This makes every event name statically known to the analytics port.

## Relationships

- **`src/modules/cart/services/checkout.ts`** — Emits `CHECKOUT_COMPLETED` / `CHECKOUT_FAILED` from this catalogue.
- **`src/modules/cart/services/items.ts`** — Emits `CART_ITEM_ADDED`, `CART_ITEM_UPDATED`, `CART_ITEM_REMOVED`, `CART_CLEARED`, `CART_VIEWED`.
- **`src/modules/cart/services/reorder.ts`** — Emits `CART_REORDERED`.
- **`tests/unit/infrastructure/observability/analytics.test.ts`** — Verifies the analytics port honors the `AnalyticsEventMap` augmentation made here.
- **`src/modules/cart/tests/integration/analytics-consent.test.ts`** — Exercises consent-gated emission of cart events.
- **`src/modules/cart/tests/integration/merge-effects.test.ts`** — Covers side effects when cart events are dispatched during merge flows.

## Notes

- Event names are owned by the *emitting* module, not by a domain concept. Checkout events live here (cart) rather than in an `orders` module because `POST /cart/checkout` is the producing endpoint. If the cart module is removed, its event names leave the catalogue automatically.
- The naming convention is specified externally in `docs/tools/analytics.md#naming`; check that doc before adding new events.
- Adding a new event is a two-step change: add the key to `cartAnalyticsEvents` **and** ensure the declaration-merge block still compiles (the `cart` key in `AnalyticsEventMap` picks up the new value automatically via the `typeof` reference).
