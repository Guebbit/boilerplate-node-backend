---
source: src/modules/delivery/services/ship-gate.ts
sha256: a50ae6442ee4a5bee24679e4e285545f7fde65921b53783be03515c5b3d4305c
generated_at: 2026-10-29T03:43:50.048545+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/services/ship-gate.ts

## Purpose

Shared gate logic for the ship and fulfil acts: determines whether a shipment may leave an order in a given status, whether the caller is permitted to make the `paid → processing` transition, and how to refuse/audit that refusal. Extracted from `ship.ts` and `fulfill.ts` so neither act (nor their `actions` flags) need to import each other.

## Key elements

- **`isOpenForShipment(status, mayStart)`** — Returns `true` if the order is shippable *or* if the caller also holds `start:Shipment` and the order is processable. Used by both acts as the first permission check.
- **`mayStartFulfilment(context)`** — Reads the caller's `start:Shipment` ability via `holds()`. Intended to be called *before* the act's transaction opens so a retry cannot flip the result.
- **`refuseUnearnedStart(status, mayStart)`** — Throws `ActRefusal` (403) when the order is in a processable status but the caller lacks `start:Shipment`. No-op for non-processable statuses (those are handled by a later gate).
- **`auditUnearnedStart(context, reject, fulfillmentOrderId)`** — If the act's response is a 403, writes a `forbidden` audit entry recording the missing `start:Shipment` permission. Must run *after* the act (post-retry) to guarantee a single write.

## Relationships

- **`src/kernel/ability.ts`** — `holds()` is used by `mayStartFulfilment` to read the caller's permissions.
- **`src/modules/orders/index.ts`** (re-exports `src/modules/orders/domain/lifecycle.ts`) — Provides `canShip` and `canProcessOrder`, the two order-status predicates this module composes.
- **`src/modules/delivery/services/act.ts`** — `ActRefusal` is the error type thrown by `refuseUnearnedStart` and caught/propagated by the acts.
- **`src/infrastructure/http/response.ts`** — `generateReject` builds the 403 `ResponseReject` body; `ResponseReject` is the response shape checked by `auditUnearnedStart`.
- **`src/infrastructure/i18n/index.ts`** — `t` supplies the localized "forbidden" message in the reject body.
- **`src/infrastructure/observability/forbidden.ts`** — `auditForbidden` performs the actual audit-row write inside `auditUnearnedStart`.
- **`src/types/index.ts`** (incl. `src/types/auth-context.ts`) — `CallerContext` and `OrderStatus` are the shared type aliases used throughout.
- **`src/modules/delivery/services/ship.ts`**, **`fulfill.ts`**, **`actions.ts`** — Consumers of this module (per its doc comment); they import these four functions rather than duplicating the gate logic. No import *into* this file from those modules exists.

## Notes

- The module intentionally has **no runtime imports** from `ship.ts`, `fulfill.ts`, or `actions.ts` — only type-level or one-way dependencies — to keep the dependency graph acyclic.
- `auditUnearnedStart` is a no-op unless `reject.status === 403`; it assumes the *only* 403 an act can produce is the one thrown by `refuseUnearnedStart`.
- `mayStartFulfilment` must be evaluated before the transaction opens; calling it inside a retried transaction could yield a stale or different result.
