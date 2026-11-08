---
source: src/modules/orders/services/override.ts
sha256: 6a73c885fda87cbeba1fa561f6f7c61f0e0dfc10172e858f603d047fae0249ec
generated_at: 2026-11-08T06:58:43.861333+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/services/override.ts

## Purpose

Implements the admin status-override endpoint (`POST /orders/{id}/status-override`). It is the single authorized path to force an order's status without going through the normal lifecycle doors (no shipped email, no carrier record). The write is atomic: status change, timeline entry, stock shelf-movement, outbox events, and audit trail all commit in one transaction, so a status move can never exist without its history row or vice-versa.

## Key elements

- **`overrideStatus`** (exported) — Entry point. Loads the order, validates the transition via `canOverrideTo` and `shipsAwaitedStock`, then delegates to `applyOverride`. Returns `ResponseSuccess<OrderDocument>` or a `ResponseReject` (404 / 409).
- **`applyOverride`** (module-private) — Performs the single transactional write: conditional status update + timeline row (`withTimeline`), stock movement or plain event announce, and post-commit audit logging. Returns the updated document or `null` (lost the optimistic-concurrency race).
- **`notAllowed`** (module-private) — Builds the shared 409 `ResponseReject` for an illegal status transition.
- **`awaitingStock`** (module-private) — Builds the 409 `ResponseReject` when the target status would ship units still in "awaiting stock".

## Relationships

- **`../domain` (barrel)** — `canOverrideTo`, `isDigitalOnlyOrder`, `deliveryClockFor`, `shipsAwaitedStock` supply the business rules that gate or parameterize the override.
- **`../repository`** — `orderRepository.findByIdScoped` (read) and `orderRepository.applyStatusOverride` (conditional write inside the session).
- **`./announce`** — `statusChangedEvent` and `statusOverriddenEvent` are the outbox payloads published after the write.
- **`./ship-stock`** — `announceMoveShippingStock` wraps the write so that non-`processing` targets also trigger stock leaving the shelf in the same transaction.
- **`./timeline`** — `withTimeline` appends the `status_overridden` history row within the same session as the status write.
- **`@kernel/outbox`** — `announceInTransaction` publishes the events atomically with the write.
- **`@infrastructure/observability/audit`** — `recordAudit` logs the successful override after the transaction commits.
- **`@infrastructure/http/response`** — `generateSuccess` / `generateReject` shape the HTTP response.
- **`@infrastructure/i18n`** — `t` localizes the error messages.
- **`../config`** — `withdrawalPeriodDays()` sets the withdrawal window when overriding into `delivered`.
- **`../audit`** — `ordersAuditActions.ORDER_STATUS_OVERRIDDEN` names the audit action.
- **`../model`** — `OrderDocument` type for the loaded and updated order.

## Notes

- **Concurrency semantics:** `applyOverride` returning `null` means the order's status changed between the read and the write (optimistic lock). The public handler maps this to the same 409 shape as a rule violation, not a 404 — the order still exists.
- **`caller.id` guard:** The `if (!actorUserId)` rejection in `applyOverride` is defensive; the route's `requirePermission('override', 'Order')` makes it unreachable. It rejects (not resolves to `null`) to avoid mislabeling an invariant violation as a 409 conflict.
- **`delivered` clock:** Overriding into `delivered` bypasses `markDelivered`, so no delivery timestamp exists. The withdrawal clock is anchored to the override time (`at`) for physical orders, or to payment for digital-only orders.
- **Stock movement is conditional:** Overriding to `processing` skips stock movement entirely (a hold doesn't ship anything). Other targets go through `announceMoveShippingStock`; if the order was already `shipped`, the stock call is effectively a no-op.
- **`orders` never touches shipments:** The `delivery` module reacts to the `order.status_overridden` outbox event to keep its own records in sync. This file does not write any carrier or shipment data.
