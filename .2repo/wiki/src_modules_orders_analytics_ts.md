# src/modules/orders/analytics.ts

## Purpose

Defines the analytics event names emitted by the orders module and registers them into the shared analytics event map via a TypeScript module augmentation. This keeps event-name ownership local to the domain that fires each event while remaining type-safe against the infrastructure analytics port.

## Key elements

- **`ordersAnalyticsEvents`** — `as const` object mapping semantic keys (`ORDER_CREATED`, `ORDER_CANCELLED`, `ORDER_RESERVATION_EXPIRED`, `ORDERS_VIEWED`) to their wire-format string values. This is the single source of truth for what the orders module reports.
- **`declare module '@infrastructure/observability/analytics'`** — augments `AnalyticsEventMap` with an `orders` key typed as the union of the event strings above, so callers get autocomplete and the infrastructure layer stays domain-agnostic.

## Relationships

- **`src/modules/orders/service.ts`** — sibling in the same module; the service (or its controllers) imports `ordersAnalyticsEvents` directly when emitting events for create, cancel, and reservation-expiry flows.
- **`scripts/contracts/analytics-events-bundle.ts`** — build-time script that collects per-module event definitions into the published frontend contract; this file's events are a contributor to that bundle.
- **`tests/unit/infrastructure/observability/analytics.test.ts`** — validates the `AnalyticsEventMap` augmentation this file performs, ensuring the `orders` key is present and correctly typed.
- **`src/modules/orders/tests/integration/cancel.test.ts`** — exercises the cancel / reservation-expiry paths and asserts the correct events (`ORDER_CANCELLED`, `ORDER_RESERVATION_EXPIRED`) are emitted.

## Notes

- **Boundary with cart:** `CHECKOUT_*` events are deliberately *absent* here; they belong to the cart module because `POST /cart/checkout` is the emitting endpoint. Do not add checkout events to this file.
- **Not published to the frontend:** these names are consumed only by same-repo controllers. The paired frontend gets its own set via `shared/contracts/analytics.frontend.ts`; separating the two prevents one event from being double-counted.
- **Outcome ≠ property:** `ORDER_RESERVATION_EXPIRED` exists as a distinct event (not a property on `ORDER_CANCELLED`) because a timeout is an unconfirmed abandonment, a different funnel fact from a customer-initiated cancel. See `docs/tools/analytics.md#an-outcome-is-a-different-event-not-a-property`.
- **Naming convention:** all event strings follow the rule in `docs/tools/analytics.md#naming` (lowercase snake_case, past tense for completions).
