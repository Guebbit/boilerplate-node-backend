# src/modules/orders/analytics.ts

## Purpose

Declares the analytics event names emitted by the orders module and registers them into the analytics port's application-wide event-name union via TypeScript module augmentation. It exists so every order-lifecycle event has a single canonical name and so the analytics type system enforces valid event strings at compile time.

## Key elements

- **`ordersAnalyticsEvents`** — `as const` object mapping intent keys to their wire-string values:
  - `ORDER_CREATED` → `'order_created'`
  - `ORDER_CANCELLED` → `'order_cancelled'`
  - `ORDER_RESERVATION_EXPIRED` → `'order_reservation_expired'`
  - `ORDERS_VIEWED` → `'orders_viewed'`
- **`declare module '@infrastructure/observability/analytics'`** — Augments `AnalyticsEventMap` with an `orders` property typed as the union of all values above, making the names part of the global analytics type surface.

## Relationships

- **`src/modules/orders/service.ts`** — The primary consumer; fires these named events during order creation, cancellation, and reservation expiry.
- **`src/modules/orders/tests/integration/cancel.test.ts`** — Integration test that exercises the cancel path and asserts the `ORDER_CANCELLED` event is emitted.
- **`tests/unit/infrastructure/observability/analytics.test.ts`** — Unit tests for the analytics infrastructure that the module augmentation plugs into.

## Notes

- `CHECKOUT_*` events are intentionally **not** here; they are declared by the cart module because `POST /cart/checkout` is the emitter.
- `ORDER_RESERVATION_EXPIRED` is a distinct event from `ORDER_CANCELLED` (abandonment vs. explicit choice), not a property on the same event — see `docs/tools/analytics.md#an-outcome-is-a-different-event-not-a-property`.
- Naming convention is governed by `docs/tools/analytics.md#naming`; new events must follow it before being added to this map.
