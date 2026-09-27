---
source: src/modules/orders/services/override.ts
sha256: 2f2aa961cbe778547148a8763c16d61de762f68f4875b1c014be9207e366b1ee
generated_at: 2026-09-27T15:15:05.695550+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/services/override.ts

## Purpose

The admin override service — the single sanctioned path for moving an order's status outside `ORDER_LIFECYCLE`'s normal gates. Two public entry points (`overrideStatus` for manual correction, `forceMove` for delivery's forced ship/deliver) both funnel through one private `applyOverride` so that the history row, domain event, and audit record are emitted exactly once and can never drift between callers. `orders` remains the sole status writer even here; `delivery` never touches `order.status` directly.

## Key elements

- **`applyOverride`** (private) — The single write path. Performs a conditional `orderRepository.applyStatusOverride` (guarding against *all* legal `from` values, not just the observed one), then fires the `ORDER_STATUS_CHANGED` domain event, records the audit entry, and—only when `observedFrom === pending`—calls `inventoryService.commitForOrder` (idempotent; no-op if already committed). Rejects (throws) if `caller.id` is missing rather than returning `null`.
- **`overrideStatus`** (exported) — Backs `POST /orders/{id}/status-override`. Reads the order, validates with `canOverrideTo`, delegates to `applyOverride` in `'status'` mode. Returns 404 / 409 / 200.
- **`forceMove`** (exported) — Called by `delivery/service.ts` when the caller passes `forced: true`. Independently checks `holdsKey(…, 'orders.any.override')` (defense-in-depth beyond delivery's own `refuseUnearnedForce` gate), then delegates to `applyOverride` in `'forced'` mode. Returns `OrderDocument | null | ResponseReject`.
- **`isForceMoveRefusal`** (exported) — Type guard distinguishing a 403 `ResponseReject` from a `null` race-lost result. Callers must check this *before* any `if (!moved)` guard, since `ResponseReject` is truthy.
- **`notAllowed` / `notEarned`** (private) — Pre-built 409 and 403 response helpers with i18n messages.

## Relationships

- **`src/modules/orders/repository.ts`** — Calls `findByIdScoped` (read) and `applyStatusOverride` (conditional write + history entry).
- **`src/modules/orders/domain/index.ts`** — Imports `canOverrideTo` and `statusesOverridableInto` for lifecycle validation.
- **`src/modules/orders/domain/lifecycle.ts`** — The `ORDER_LIFECYCLE` this module intentionally bypasses.
- **`src/modules/orders/events.ts`** — Emits the `ORDER_STATUS_CHANGED` domain event.
- **`src/modules/orders/audit.ts`** — Supplies the `ORDER_STATUS_OVERRIDDEN` action constant for the audit record.
- **`src/modules/orders/model.ts`** — Types `OrderDocument` and `OrderStatusOverride` (the history-entry shape).
- **`src/kernel/events.ts`** — `emitDomainEvent` for the status-changed event.
- **`src/kernel/ability.ts`** — `holdsKey` to verify `orders.any.override` in `forceMove`.
- **`src/infrastructure/observability/audit.ts`** — `recordAudit` for the audit trail entry.
- **`src/infrastructure/http/response.ts`** — `generateSuccess` / `generateReject` / response types for all return shapes.
- **`src/infrastructure/i18n/index.ts`** — `t()` for localized error messages.
- **`src/modules/inventory/service.ts`** — `commitForOrder` called when overriding out of `pending` (idempotent settle).
- **`src/modules/delivery/service.ts`** — The sole caller of `forceMove`; shares the identical 403 shape (`notEarned`) for its own `refuseUnearnedForce` gate.

## Notes

- `null` return from `applyOverride` means "lost a race against another write"; a thrown rejection means an invariant violation (missing caller id). `overrideStatus` maps `null` to a 409, `forceMove` passes it through—consumers must use `isForceMoveRefusal` first to avoid treating a 403 object as a successful move.
- The `observedFrom` value is recorded as-is on the history entry, but the conditional write guards against *every* legal `from` for `to`. A benign race (order moved between read and write but stayed within the allowed set) still lands; the history entry's `from` may be one step stale. The docblock explicitly accepts this rather than requiring a strict read-your-write transaction.
- `forceMove` re-checks `orders.any.override` even though `delivery` already checked it at its own gate—intentional defense-in-depth so a direct call bypassing delivery's route cannot force a move.
- The inventory commit is only triggered when `observedFrom === pending` (offline-paid orders where settlement never ran). Overrides from `paid` onward skip it; settlement already committed the reservation earlier.
- Webhooks (domain events) fire on override just as on normal transitions—subscribers care that the status moved, not which door was used.
