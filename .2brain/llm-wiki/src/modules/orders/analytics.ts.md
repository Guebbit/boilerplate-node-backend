---
source: src/modules/orders/analytics.ts
sha256: 0b3c9225b8189605b37a6c1dae4c235782f017ef841b3f8984397b3ba4940590
generated_at: 2026-11-08T06:44:47.464032+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/analytics.ts

## Purpose
Declares the set of analytics event names the orders module emits and registers them into the app-wide `AnalyticsEventMap` union so the analytics port can type-check them at the call site. It is a pure declaration file: no runtime logic, no side effects beyond exporting a frozen const.

## Key elements
- **`ordersAnalyticsEvents`** — `as const` object with four event names:
  - `ORDER_CREATED` (`'order_created'`)
  - `ORDER_CANCELED` (`'order_canceled'`)
  - `ORDER_RESERVATION_EXPIRED` (`'order_reservation_expired'`) — distinct from cancel; represents abandonment, not a user choice
  - `ORDERS_VIEWED` (`'orders_viewed'`)
- **`declare module '@infrastructure/observability/analytics'`** — interface augmentation adding an `orders` key to `AnalyticsEventMap`, mirroring the pattern used by `./audit.ts` for audit actions.

## Relationships
- **`services/crud.ts`** — consumes `ORDER_CREATED` when a new order is persisted.
- **`services/cancel.ts`** — consumes `ORDER_CANCELED` (and likely `ORDER_RESERVATION_EXPIRED`) when ending an order.
- **`services/read.ts`** — consumes `ORDERS_VIEWED` when the order list/detail is fetched.
- **`tests/integration/cancel.test.ts`** and **`tests/integration/erase-cancels-unpaid.test.ts`** — assert the correct event names are emitted on the cancel and reservation-expiry paths.
- **`tests/unit/infrastructure/observability/analytics.test.ts`** — exercises the analytics port against which this module's augmentation is type-checked.

## Notes
- `CHECKOUT_*` events are deliberately **not** declared here; they belong to the cart module because `POST /cart/checkout` is the emitting endpoint.
- `ORDER_RESERVATION_EXPIRED` is a separate event from `ORDER_CANCELED` by design (see `docs/tools/analytics.md#an-outcome-is-a-different-event-not-a-property`). Do not "simplify" them into one event with a status property.
- Naming conventions are governed by `docs/tools/analytics.md#naming`; keep new events snake_case and past-tense.
