---
source: src/modules/cart/analytics.ts
sha256: c6a6be9f3d1bb648fa009742f625bc8cb2053d782ab88c1fddd6b6c35c0fd088
generated_at: 2026-09-23T18:28:41.456673+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/analytics.ts

## Purpose

Declares the analytics event names emitted by the cart module and registers them into the application-wide `AnalyticsEventMap` via TypeScript module augmentation. It exists so that event-name strings live alongside the code that emits them, keeping the global catalogue self-documenting and typed.

## Key elements

- **`cartAnalyticsEvents`** — A `const` object mapping intents to event-name strings (`cart_viewed`, `cart_item_added`, `cart_item_updated`, `cart_item_removed`, `cart_cleared`, `cart_reordered`, `checkout_completed`, `checkout_failed`). Used as the single source of truth for the strings the cart services fire.
- **`declare module '@infrastructure/observability/analytics'`** — Augments the `AnalyticsEventMap` interface with a `cart` key typed as the union of `cartAnalyticsEvents` values, making every event name a member of the app-wide union at compile time.

## Relationships

- **`src/modules/cart/services/checkout.ts`** — Emits `CHECKOUT_COMPLETED` and `CHECKOUT_FAILED`; these names live in this file because the `POST /cart/checkout` endpoint (defined in checkout service) is the emitting code.
- **`src/modules/cart/services/items.ts`** — Emits `CART_ITEM_ADDED`, `CART_ITEM_UPDATED`, `CART_ITEM_REMOVED`, `CART_CLEARED`.
- **`src/modules/cart/services/reorder.ts`** — Emits `CART_REORDERED` (the order is read-only; the cart is the entity that changes).
- **`tests/unit/infrastructure/observability/analytics.test.ts`** — Exercises the analytics port infrastructure against which this module's augmentation is validated.

## Notes

- The file contains **no runtime logic** — it is purely a type-level declaration plus a `const` export. There is nothing to import for side effects; consuming files import `cartAnalyticsEvents` and gain the typed union via the augmentation.
- The same augmentation pattern is used in `./audit.ts` for audit actions; the convention is "a name belongs to the code that emits it."
- Event-name strings must follow the rule documented in `docs/tools/analytics.md#naming` (lowercase snake_case).
