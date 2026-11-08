---
source: src/modules/delivery/services/ship-gate.ts
sha256: 6a2c4b21c89ef728dbb1047d3f1285b224ba7d8abb4ea74ee384ad3ef4bd80dc
generated_at: 2026-11-08T05:39:42.507634+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/services/ship-gate.ts

## Purpose

Answers the single order-state question shared by the ship act, the fulfill act, and their `actions` flags: *may a shipment leave an order in this status?* Extracted into its own module so that `ship.ts`, `fulfill.ts`, and `actions.ts` can each consume the gate without importing one another. Also centralises the "may this caller make the `paid → processing` move?" check that both acts perform themselves.

## Key elements

- **`isOpenForShipment(status, mayStart)`** — Returns `true` when `canShip(status)` is true, *or* when the caller holds `start:Shipment` and `canProcessOrder(status)` is true. The second branch means shipping from `paid` is legitimate if the act will transition the order to `processing` on its own.
- **`mayStartFulfillment(context)`** — Reads the `start:Shipment` ability from the caller via `holds()`. Intended to be called *before* the act's transaction opens so a retry cannot alter the result.
- **`refuseUnearnedStart(status, mayStart)`** — Throws `ActRefusal` (a 403 reject) when the order is in a processable status but the caller lacks `start:Shipment`. Any other status is left to the subsequent gate.
- **`auditUnearnedStart(context, reject, fulfillmentOrderId)`** — Writes a single `auditForbidden` row for the 403 above. Must be called *after* the act completes (outside the transaction) so a retried transaction doesn't duplicate the audit row.

## Relationships

- **`src/modules/orders/index.ts`** (→ `domain/lifecycle.ts`) — Imports `canShip` and `canProcessOrder`, the two lifecycle predicates that drive every gate decision in this file.
- **`src/kernel/ability.ts`** — Imports `holds()` to evaluate the `start:Shipment` ability.
- **`src/infrastructure/http/response.ts`** — Imports `generateReject` and the `ResponseReject` type to build the 403 payload and to type the `reject` parameter of `auditUnearnedStart`.
- **`src/infrastructure/i18n/index.ts`** (→ `context.ts`) — Imports `t()` for the localised `generic.error-forbidden` message.
- **`src/infrastructure/observability/forbidden.ts`** — Imports `auditForbidden` to record the 403.
- **`src/modules/delivery/services/act.ts`** — Imports the `ActRefusal` class used as the thrown error type.
- **`src/types/index.ts`** (→ `auth-context.ts`) — Imports `CallerContext` and `OrderStatus` type aliases.
- **`src/modules/delivery/services/ship.ts` / `fulfill.ts` / `actions.ts`** — *Downstream* consumers of this gate; this file intentionally does **not** import them (avoids circular dependencies).

## Notes

- The `auditUnearnedStart` guard (`if (reject.status !== 403) return`) exists because the act's *only* 403 path is the one thrown by `refuseUnearnedStart`; the early-return is a safety check, not a branch with other semantics.
- `mayStartFulfillment` must be read **before** the transaction boundary. The caller is expected to thread that boolean into `isOpenForShipment` and `refuseUnearnedStart`; reading it inside the act's transaction would make the result non-deterministic across retries.
- The module doc explicitly states the separation contract: none of `ship.ts`, `fulfill.ts`, `actions.ts`, or this file may import the others. If a new shared predicate is needed, add it here (or to a sibling gate) rather than reaching across.
