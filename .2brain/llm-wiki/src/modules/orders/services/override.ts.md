---
source: src/modules/orders/services/override.ts
sha256: 9ea8e73fb290bda5ccc02675dbd33e8734d3d4aa829604ef7bb730b408085c6b
generated_at: 2026-09-23T19:08:01.173976+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/services/override.ts

## Purpose

Implements the admin override — the sole mechanism that may move an order to a status the normal `ORDER_LIFECYCLE` would refuse, or advance status without the parcel/email side-effects of the regular delivery doors. Two public entry points (`overrideStatus`, `forceMove`) share a single internal write path (`applyOverride`) so that the history row, domain event, and audit record are always produced together and can never drift.

## Key elements

- **`applyOverride`** (module-private) — The one write path. Performs the conditional repository write, optionally commits the inventory reservation (when the order was at `pending`), emits `ORDER_STATUS_CHANGED`, and records an audit entry. Returns `OrderDocument | null` (`null` = lost a race).
- **`overrideStatus`** (exported) — Handles `POST /orders/{id}/status-override`. Reads the order, checks `canOverrideTo`, delegates to `applyOverride` with `mode: 'status'`. Returns a 404, 409, or 200 response.
- **`forceMove`** (exported) — Called by `delivery`'s ship/deliver doors when the caller passed `forced: true`. Same shape but `mode: 'forced'`; returns `OrderDocument | null` rather than an HTTP-shaped response, so `delivery` can wrap it in its own error handling.
- **`notAllowed`** (module-private) — Builds the shared 409 `ResponseReject` with code `ORDER_OVERRIDE_NOT_ALLOWED` and an i18n-translated message.

## Relationships

- **`src/modules/orders/repository.ts`** — Calls `orderRepository.findByIdScoped` and `orderRepository.applyStatusOverride` (the conditional write guarded by `allowedFrom`).
- **`src/modules/orders/domain/index.ts`** — Calls `canOverrideTo` (gate check) and `statusesOverridableInto` (derives the legal `from` set for the conditional write).
- **`src/modules/orders/domain/lifecycle.ts`** — The lifecycle rules this file intentionally bypasses; referenced in the module docblock as the "gate" being skipped.
- **`src/modules/orders/events.ts`** — Emits `ORDER_STATUS_CHANGED` after a successful write.
- **`src/modules/orders/audit.ts`** — Uses `ordersAuditActions.ORDER_STATUS_OVERRIDDEN` as the audit action identifier.
- **`src/modules/orders/model.ts`** — Shapes `OrderDocument` and `OrderStatusOverride` used throughout.
- **`src/kernel/events.ts`** — Calls `emitDomainEvent`.
- **`src/infrastructure/observability/audit.ts`** — Calls `recordAudit`.
- **`src/infrastructure/http/response.ts`** — Uses `generateSuccess` / `generateReject` to build HTTP responses.
- **`src/infrastructure/i18n/index.ts`** — Uses `t()` for user-facing error messages.
- **`src/modules/inventory/index.ts` → `src/modules/inventory/service.ts`** — Calls `inventoryService.commitForOrder(orderId)` when the order was at `pending`, to release a reservation that `settlement` never processed.
- **`src/modules/orders/services/index.ts`** — Barrel that re-exports this module's public API.
- **`src/modules/orders/tests/integration/service-override.test.ts`** — Integration test covering both doors and the race-condition path.

## Notes

- **Tolerated race on `observedFrom`:** The history entry records the `from` seen at read time, but the conditional write guards against _all_ legal `from` values. If the order advanced one more step between read and write (still within the allowed set), the write succeeds and the history entry's `from` may be one step stale. This is intentional — admin overrides are not hot-path enough to justify a strict read-your-write transaction.
- **`null` vs. reject:** A `null` return from `applyOverride` means "lost a race" (order moved past every legal `from`). A missing `caller.id` is a _reject_ (invariant violation), not a `null`, so `overrideStatus` reports it as a 500 rather than a 409.
- **Inventory commit is idempotent:** `commitForOrder` is only called when `observedFrom === 'pending'`, and it is a no-op if the reservation is already committed — safe under the race described above.
- **`forceMove` swallows 404/409 into `null`:** Unlike `overrideStatus`, it returns `null` for both "order not found" and "override not legal from current status." The `delivery` caller is expected to inspect and re-wrap as needed.
- **`orders` remains the sole status writer:** Even when `delivery` initiates the move via `forceMove`, the actual `order.status` write happens here. `delivery` never writes `order.status` directly.
