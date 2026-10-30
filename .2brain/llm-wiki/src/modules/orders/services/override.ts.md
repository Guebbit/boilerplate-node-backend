---
source: src/modules/orders/services/override.ts
sha256: 6a73c885fda87cbeba1fa561f6f7c61f0e0dfc10172e858f603d047fae0249ec
generated_at: 2026-10-29T04:48:10.369363+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/services/override.ts

## Purpose

Implements the admin status-override endpoint (`POST /orders/{id}/status-override`): a single-transaction correction that moves an order's status when the normal fulfillment path (shipped email, carrier record) is inapplicable. It atomically writes the new status, a timeline row, any required stock movement, outbox events, and an audit record so no partial state can exist.

## Key elements

- **`overrideStatus`** (exported) — Public entry point. Loads the order by ID (404 if missing), validates the transition via `canOverrideTo` and `shipsAwaitedStock` (409 if illegal), then delegates to `applyOverride`. A `null` return from `applyOverride` (lost a concurrent-write race) is reported as the same 409 `notAllowed` shape rather than a 404.
- **`applyOverride`** (private) — Performs the actual write inside one MongoDB session: conditional status update (`applyStatusOverride`), a `status_overridden` timeline entry, optional stock movement (skipped when target is `processing`), outbox events (`statusChangedEvent` + `statusOverriddenEvent`), and an `recordAudit` call. Rejects (not resolves `null`) if `caller.id` is missing, since that is an invariant violation, not a race.
- **`notAllowed`** (private) — Builds the standard 409 `ResponseReject` with code `ORDER_OVERRIDE_NOT_ALLOWED` and i18n message.
- **`awaitingStock`** (private) — Builds the 409 `ResponseReject` with code `ORDER_OVERRIDE_AWAITING_STOCK` for orders whose fulfillment is still awaiting stock.

## Relationships

- **`@infrastructure/http/response`** — Consumes `generateReject` / `generateSuccess` and the `ResponseReject` / `ResponseSuccess` types to shape all API responses.
- **`@infrastructure/i18n`** — Uses `t()` for user-facing error messages.
- **`@infrastructure/observability/audit`** — Calls `recordAudit` after a successful write to log the override action.
- **`@kernel/outbox`** — Uses `announceInTransaction` to publish domain events within the same DB session as the write.
- **`../domain` (index, rules, lifecycle, fulfillment, withdrawal)** — Reads domain predicates: `canOverrideTo`, `isDigitalOnlyOrder`, `deliveryClockFor`, `shipsAwaitedStock`.
- **`../config`** — Reads `withdrawalPeriodDays()` to compute the delivery clock when overriding into `delivered`.
- **`../audit`** — Imports `ordersAuditActions.ORDER_STATUS_OVERRIDDEN` as the audit action identifier.
- **`../model`** — Types the `OrderDocument` passed through the pipeline.
- **`../repository`** — Calls `orderRepository.findByIdScoped` (read) and `orderRepository.applyStatusOverride` (conditional write with session).
- **`./announce`** — Imports `statusChangedEvent` and `statusOverriddenEvent` factories for the outbox payload.

## Notes

- Overriding into `delivered` sets a delivery clock derived from the override timestamp (or payment date for digital-only orders), because this path bypasses the normal `markDelivered` flow.
- A target of `processing` skips stock movement entirely (it is a hold, not a dispatch); all other non-processing targets route through `announceMoveShippingStock`.
- The race-condition 409 reuses the `notAllowed` response shape; the order still exists, so a 404 would be incorrect.
- The `caller.id` guard intentionally rejects with a 500-level `Error` rather than resolving `null`, keeping the 409 channel reserved exclusively for "lost the race."
