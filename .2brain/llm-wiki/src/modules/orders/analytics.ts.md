---
source: src/modules/orders/analytics.ts
sha256: eb9ba54daa9130ed396b27fb87e2200b6d403fa13a5a6bcd36dd7d1e9fe2a88c
generated_at: 2026-09-23T18:59:31.218050+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/analytics.ts

## Purpose

Declares the analytics event names the orders module emits and registers them into the app-wide `AnalyticsEventMap` type. This file exists so that event names live in one source-of-truth location and the analytics port's union type stays in sync across modules.

## Key elements

- **`ordersAnalyticsEvents`** (const object, exported) — the four event-name strings this module can fire: `ORDER_CREATED`, `ORDER_CANCELLED`, `ORDER_RESERVATION_EXPIRED`, `ORDERS_VIEWED`. Frozen via `as const`.
- **`declare module '@infrastructure/observability/analytics'`** augmentation — adds an `orders` key to `AnalyticsEventMap`, typed as the union of the values above, so the port accepts these names type-safely.

## Relationships

- **`src/modules/orders/services/crud.ts`** — imports `ordersAnalyticsEvents` to fire `ORDER_CREATED` (and likely `ORDERS_VIEWED`) during order creation / listing flows.
- **`src/modules/orders/services/cancel.ts`** — imports `ordersAnalyticsEvents` to fire `ORDER_CANCELLED` or `ORDER_RESERVATION_EXPIRED` when a reservation is cancelled by the user or times out.
- **`src/modules/orders/tests/integration/cancel.test.ts`** — asserts the correct analytics event is emitted for the cancel / expiry paths.
- **`tests/unit/infrastructure/observability/analytics.test.ts`** — validates the analytics port infrastructure against the event names declared here.

This file has **no runtime imports**; it is purely a type-level + constant declaration. Neighbors depend on it, not vice-versa.

## Notes

- `ORDER_RESERVATION_EXPIRED` is intentionally a **separate event** from `ORDER_CANCELLED` (abandonment vs. user choice). Do not collapse them into one event with a property flag — see `docs/tools/analytics.md#an-outcome-is-a-different-event-not-a-property`.
- `CHECKOUT_*` events are **not** declared here; they belong to the cart module because `POST /cart/checkout` is the emitting endpoint.
- Event names follow the convention in `docs/tools/analytics.md#naming` (lowercase, underscore-separated, past-tense verb).
- The same augmentation pattern is used by `./audit.ts` for audit actions; adding a new event here means adding a key to `ordersAnalyticsEvents` — the type union updates automatically.
