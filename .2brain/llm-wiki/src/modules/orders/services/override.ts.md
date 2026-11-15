---
source: src/modules/orders/services/override.ts
sha256: 09e91a8ba1ff1d500ed0304ebc111141beeff661716d025d64e2e3d6d95c3a67
generated_at: 2026-11-14T20:44:14.548816+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/services/override.ts

## Purpose

Implements the admin status-override endpoint (`POST /orders/{id}/override-status`). It corrects an order's status in a single MongoDB transaction—writing the new status, the timeline row, the stock adjustment, the outbox events, and the audit record atomically—so that no partial state is ever observable. It exists as the "back door" for manual corrections where the normal lifecycle (shipped email, carrier tracking) would produce an incorrect consequence.

## Key elements

- **`overrideStatus`** (exported) — Public entry point. Loads the order, validates that the transition is legal via `canOverrideTo` and that the target doesn't require awaited stock, then delegates to `applyOverride`. Returns `ResponseSuccess` or a 404/409 `ResponseReject`.
- **`applyOverride`** (internal) — Performs the single-transaction write. Builds a conditional status update scoped to the observed `from` status, wraps it with `withTimeline`, announces `statusChangedEvent` + `statusOverriddenEvent` via `announceInTransaction`, and routes stock through `announceMoveShippingStock` unless the target is `processing`. Records audit via `recordAudit` on success. Returns `null` if the conditional write lost a race.
- **`notAllowed`** (internal) — Builds the shared 409 reject response for illegal transitions.
- **`clock`** (local logic) — When overriding *to* `delivered`, computes a delivery/withdrawal deadline from the override timestamp (or payment date for digital orders) via `deliveryClockFor`, since `markDelivered` was never called.

## Relationships

- **`src/infrastructure/http/response.ts`** — Uses `generateSuccess` / `generateReject` for all return shapes.
- **`src/infrastructure/i18n/index.ts`** — Calls `t()` for user-facing error messages.
- **`src/infrastructure/observability/audit.ts`** — Calls `recordAudit` after a successful write.
- **`src/kernel/outbox.ts`** — Uses `announceInTransaction` to enqueue domain events within the same transaction as the status write.
- **`src/modules/orders/audit.ts`** — Imports the `ordersAuditActions` enum; uses `ordersAuditActions.ORDER_STATUS_OVERRIDDEN` as the audit action discriminator.
- **`src/modules/orders/config.ts`** — Reads `withdrawalPeriodDays()` for the delivery clock calculation.
- **`src/modules/orders/domain/index.ts`** — Imports `canOverrideTo`, `isDigitalOnlyOrder`, `deliveryClockFor`, `shipsAwaitedStock` (re-exported from the domain sub-modules `rules`, `lifecycle`, `fulfillment`, `withdrawal`).
- **`src/modules/orders/model.ts`** — Types the `OrderDocument` that is read and returned.
- **`src/modules/orders/repository.ts`** — `findByIdScoped` for the scoped read; `applyStatusOverride` for the conditional write inside the session.
- **`src/modules/orders/services/announce.ts`** — `statusChangedEvent` and `statusOverriddenEvent` factories consumed by the outbox announcement.

## Notes

- The conditional write (`observedFrom`) means a concurrent status change causes a 409, not a 404—the order still exists, it just isn't in the expected state.
- `context.caller.id` is typed optional but is asserted non-null inside `applyOverride`; a missing id is treated as an invariant violation (rejected), not a race (null).
- Overriding to `processing` skips stock movement entirely; overriding past dispatch still triggers `announceMoveShippingStock`.
- Webhooks fire on override just as they do on normal status changes—subscribers see `order.status_changed` regardless of which "door" moved the status.
- The `reason` parameter is required and validated at the schema layer before reaching this function.
