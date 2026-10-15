---
source: src/modules/orders/module.ts
sha256: 85e8644cec810ab2c16132e229f4a41a9a33d1f76fe816d20701b1196e6852d0
generated_at: 2026-10-15T11:04:59.314239+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/module.ts

## Purpose
Module manifest (default `AppModule` export) that registers the **orders** module with the kernel: wires routes, config, rate-limits, public-event mappings, PII hooks, cross-module event subscriptions, and the test-scenario state list into a single declarative object. It is the one place where the orders module's surface area is declared to the rest of the system.

## Key elements

- **`publicEvents`** – Maps the three internal domain events (`ORDER_CREATED`, `ORDER_STATUS_CHANGED`, `ORDER_CANCELLED`) to webhook-visible public events. `order.status_changed` is *not* a 1:1 rename: it emits `order.paid` only when `payload.to === 'paid'` and returns `undefined` for every other transition, so downstream listeners filter on `to` rather than the event name.
- **`personalData`** – Two GDPR sections:
  - *orders*: collects via `findOwnOrders`, erases via `eraseUserOrders` (detach, never hard-delete; un-paid orders are also cancelled post-commit), minimises via `startOrderPiiClock` (starts the PII retention clock without deleting).
  - *orderTimeline*: collects the full staff-annotated timeline via `collectTimelineOf`; erased as a side-effect of the orders' own `erase`.
- **`subscribe()`** – Registers a `RESERVATION_EXPIRED` handler that calls `cancelById(orderId, SYSTEM_ACTOR, …)`. The actor is `SYSTEM_ACTOR` because the shop (not the buyer) is performing the cancel.
- **`scenario.shop`** – Ordered list of order states that `scenarios/flows/shop-history.ts` must produce; asserted bidirectionally by `tests/integration/scenarios/shop.test.ts`.
- **`config`, `rateLimits`, `locales`, `templates`** – Standard module metadata consumed by the kernel at boot.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/kernel/registry.ts` | Supplies the `AppModule` and `PublicEventTarget` types; `resolvePublicEvents` is how `webhooks/services/publish.ts` discovers `publicEvents` without importing event names. |
| `src/kernel/events.ts` | `onDomainEvent` is the subscription primitive used inside `subscribe()`. |
| `src/kernel/permissions.ts` | `SYSTEM_ACTOR` constant passed as the actor for reservation-expiry cancels. |
| `src/modules/inventory/index.ts` | Imports `RESERVATION_EXPIRED`; inventory releases units on that event, orders cancels the order — the two paths converge safely in `releaseForOrder` (idempotent, no double-release). |
| `src/modules/orders/events.ts` | `ORDER_CREATED`, `ORDER_STATUS_CHANGED`, `ORDER_CANCELLED` imported **directly** (not through the module barrel) to register into the kernel's `DomainEventMap`. |
| `src/modules/orders/routes.ts` | The Hono/router instance mounted at `basePath: '/orders'`. |
| `src/modules/orders/config.ts` | `ordersConfig` — jurisdiction, currency, bank-transfer, and order-link settings. |
| `src/modules/orders/rate-limits.ts` | `ordersRateLimits` applied by the kernel's rate-limit middleware. |
| `src/modules/orders/services/cancel.ts` | `cancelById` invoked by the `RESERVATION_EXPIRED` subscription. |
| `src/modules.ts` | Registers this module in the application's module list. |
| `src/modules/invoicing/*` (tests) | Invoicing depends on this module (VAT breakdown, auth-scoped order read) and reacts to `ORDER_STATUS_CHANGED` on its own; **this file has no import of, or wiring for, invoicing**. |

## Notes

- **Barrel rule:** Event constants are imported from `./events` directly, never through this module's own barrel (`src/modules/orders/index.ts`), per the project's CLAUDE.md module-barrel rule.
- **`order.paid` is conditional:** The `ORDER_STATUS_CHANGED` → `order.paid` mapping returns `undefined` for non-`paid` transitions. Any consumer expecting a public event for *every* status change will silently receive nothing.
- **Cancel idempotency:** The reservation-expiry path and the user-initiated cancel path both funnel through `cancelById` → `releaseForOrder`. The second call finds the hold already released, so double-release is structurally impossible.
- **Erase ≠ delete:** `eraseUserOrders` detaches the buyer's identity from the order (the order row survives); `startOrderPiiClock` only starts a retention timer on an inactive account's orders. Neither removes the order.
- **Scenario list is a contract:** Adding a new order state to the storefront or admin without updating `scenario.shop` will break `shop.test.ts`'s bidirectional equality assertion.
