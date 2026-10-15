---
source: src/modules/orders/services/override.ts
sha256: ba63e9094dca6f229a6f19a5a991ba4f8dbcaf91d9c9dfba831e0f5384005241
generated_at: 2026-10-15T11:09:08.116217+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/services/override.ts

## Purpose

Implements the admin status-override endpoint (`POST /orders/{id}/status-override`), the single authorized path for correcting an order status when the normal doors (shipped email, carrier record) don't apply. It performs the status write, timeline entry, stock adjustment, event publication, and audit recording in one atomic transaction so no status move can exist without its history row or vice versa.

## Key elements

- **`overrideStatus`** (exported) — Public handler. Loads the order scoped to the caller, validates the transition via `canOverrideTo`, rejects awaiting-stock orders, delegates to `applyOverride`, and returns a `ResponseSuccess` or a `409` reject (lost-race or illegal target).
- **`applyOverride`** (internal) — Executes the single transactional write: conditional status update, timeline row via `withTimeline`, stock movement via `announceMoveShippingStock` (or plain `announceInTransaction` for `processing`), event publication, and `recordAudit`. Returns the updated `OrderDocument` or `null` if the conditional write lost a race.
- **`notAllowed`** (internal) — Builds the standard `409` reject with `ERROR_CODES.ORDER_OVERRIDE_NOT_ALLOWED` for illegal `from → to` transitions.
- **`awaitingStock`** (internal) — Builds the `409` reject for orders whose fulfillment is still awaiting stock.

## Relationships

- **`@infrastructure/http/response`** — Uses `generateReject` / `generateSuccess` and the `ResponseReject` / `ResponseSuccess` types to shape HTTP responses.
- **`@infrastructure/i18n`** — Calls `t()` for localized error messages (`orders.override.not-allowed`, `orders.override.awaiting-stock`).
- **`@infrastructure/observability/audit`** — Calls `recordAudit` after a successful write.
- **`@kernel/outbox`** — Calls `announceInTransaction` to publish domain events within the same Mongoose session as the write.
- **`../domain`** (barrel) — Imports `canOverrideTo`, `isDigitalOnlyOrder`, `shipsAwaitedStock`, `withdrawalStartFor`, `withdrawUntilFrom` for transition rules and deadline computation.
- **`../config`** — Reads `withdrawalPeriodDays` to compute the `withdrawUntil` timestamp when overriding to `delivered`.
- **`../model`** — Types the `OrderDocument` passed through the pipeline.
- **`../repository`** — Calls `orderRepository.findByIdScoped` and `orderRepository.applyStatusOverride`.
- **`../audit`** — Supplies the `ordersAuditActions.ORDER_STATUS_OVERRIDDEN` constant.
- **`./announce`** — Imports `statusChangedEvent` and `statusOverriddenEvent` factory functions for the outbox payload.

## Notes

- **No delivery-side writes.** This file never touches shipment records. It publishes `order.status_overridden` via the outbox; the `delivery` module reacts independently. A forced shipment recorded through `delivery` writes its own history row via `recordForcedFulfilment`, not through this path.
- **`from` is captured at read time.** The conditional write in `orderRepository.applyStatusOverride` includes the observed `from` status, so a concurrent write invalidates the override and `applyOverride` returns `null` (reported as `409`, not `404`).
- **Missing `caller.id` is a reject, not a null.** `applyOverride` explicitly rejects rather than returning `null` when `context.caller.id` is absent, because `null` is reserved for the "lost a race" case and the two must produce different HTTP semantics upstream.
- **`processing` skips stock movement.** Overriding to `processing` uses plain `announceInTransaction`; any target that implies dispatch routes through `announceMoveShippingStock` instead.
