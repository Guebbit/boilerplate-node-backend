---
source: src/modules/orders/analytics.ts
source_sha256: da7fddf981090ecd15b4e10bbc83897ee5590f2cd1489adb46791a3251f6b8cb
context_sha256: 05ed945ad448ce91caeb06f0e06bfa76c5421bd7a6f46dc2a202fa8f512b9337
generated_at: 2026-11-22T06:06:52.897535+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/orders/analytics.ts

## Purpose
Declares the analytics event names the orders module emits, covering the order record's own lifecycle. It also registers those names into the analytics port's app-wide event-name union. `CHECKOUT_*` events are deliberately not here; they live in the cart module because `POST /cart/checkout` reports them.

## Key elements
- `ordersAnalyticsEvents`: an `as const` object mapping intent keys to snake_case event names:
  - `ORDER_CREATED` → `order_created`
  - `ORDER_CANCELED` → `order_canceled`
  - `ORDER_RESERVATION_EXPIRED` → `order_reservation_expired`
  - `ORDERS_VIEWED` → `orders_viewed`
- Module augmentation of `@infrastructure/observability/analytics`: adds an `orders` entry to `AnalyticsEventMap`, typed as the union of the values above.

## Relationships
- The listed neighbors are the order services (`src/modules/orders/services/cancel.ts`, `src/modules/orders/services/crud.ts`, `src/modules/orders/services/read.ts`), integration tests (`src/modules/orders/tests/integration/cancel.test.ts`, `src/modules/orders/tests/integration/erase-cancels-unpaid.test.ts`), and the observability analytics unit test (`tests/unit/infrastructure/observability/analytics.test.ts`). The file's content does not show how they use it.
- The augmentation targets the analytics port in `@infrastructure/observability/analytics`.

## Notes
- `ORDER_RESERVATION_EXPIRED` is a separate event from `ORDER_CANCELED` on purpose. A customer cancel is a choice, while an unpaid reservation timing out is an abandonment nobody confirmed, so a funnel should count them separately. This is the same outcome-as-its-own-event shape as `checkout_completed`/`checkout_failed`.
- The file's doc comments point to an analytics naming guide (`#naming` section, and `#an-outcome-is-a-different-event-not-a-property` for the expiry event).
- The event-name declaration follows the same augmentation pattern used for audit actions in a sibling `audit.ts`.
- Adding a new event name here is enough to extend the typed union, because the augmentation derives its type from the object's values.
