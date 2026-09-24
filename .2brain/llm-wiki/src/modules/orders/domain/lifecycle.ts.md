---
source: src/modules/orders/domain/lifecycle.ts
sha256: e360e250a39ba23c83196861522c688c8d4fa0bedad94b9e02225cad387b3d3c
generated_at: 2026-09-23T19:01:37.697022+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/domain/lifecycle.ts

## Purpose

Centralises the order state machine: which status may transition to which, and which actor (`customer`, `admin`, `system`) is allowed on each edge. Services, payment flows, the delivery module, and client-facing action rendering all consult this file instead of encoding their own status comparisons, so the rules live in exactly one place and a new contract status surfaces as a compile error.

## Key elements

- **`OrderActor`** – union `'customer' | 'admin' | 'system'`. `system` is narrower than `admin` (moves nobody may make by hand), not a higher rank.
- **`ORDER_LIFECYCLE`** – total `Record<OrderStatus, …>` mapping each status to the subset of destination statuses and the actors permitted on that edge. Terminal states carry `{}`.
- **`canTransition(from, to, actor)`** – the primary guard. `from === to` is always allowed *except* into `paid`, where only `system` may echo-write (payment-webhook retries). Otherwise looks up the edge in `ORDER_LIFECYCLE`.
- **`isPayable(status)`** – answers "may a payment be initiated against this order?" True only for `pending`; explicitly excludes the `paid → paid` echo that `canTransition` permits.
- **`canOverrideTo(from, to)`** – forward-only admin override rule (may land on `processing`, `shipped`, or `delivered`). Deliberately independent of `ORDER_LIFECYCLE` so it can skip a `from` gate the normal lifecycle enforces.
- **`statusesOverridableInto(to)`** – returns every status strictly earlier than `to` in the overridable sequence; feeds the `from`-set for a conditional write in the override path.
- **`statusesReachableFrom(from, actor)`** – forward-looking: statuses `actor` may move to from `from` (excludes `from` itself). Used for 409 response payloads.
- **`statusesLeadingTo(to, actor)`** – backward-looking: statuses that may precede `to`; feeds `updateStatusIfIn`'s `from` set.
- **`orderActionsFor(status, actor)`** – returns the `OrderActions` shape a client renders: `transitions`, `cancel` flag, and `pay` flag. All three derived from one consistent reading.

## Relationships

- **`src/types/index.ts`** – imports `OrderStatus` and `OrderActions`; the file's types are grounded in the shared contract.
- **`src/modules/orders/domain/index.ts`** – barrel re-exports of everything above.
- **`src/modules/orders/services/status.ts`** – calls `canTransition` and `statusesLeadingTo`; its `markShipped` / `markDelivered` are the concrete "system" moves that this table authorises.
- **`src/modules/orders/services/override.ts`** – calls `canOverrideTo` and `statusesOverridableInto` for forward-only admin moves.
- **`src/modules/orders/services/cancel.ts`** – exercises the `→ cancelled` edges through `canTransition`.
- **`src/modules/delivery/service.ts`** – the "delivery's own door" whose handover/arrival events trigger the `system` moves into `shipped` and `delivered` (referenced in the table's comments).
- **`src/modules/payments/services/intent.ts`**, **`offline.ts`**, **`view.ts`** – call `isPayable` as the single "can I pay this?" gate before creating or displaying a payment.
- **`src/modules/orders/tests/unit/lifecycle.test.ts`** – unit tests for every exported function.

## Notes

- `ORDER_LIFECYCLE` is **total** over `OrderStatus`: adding a new status to the contract without an entry here is a compile error, not a silent dead-end.
- The `from === to` special case in `canTransition` is asymmetric: echoing into any status is fine, but echoing into `paid` is restricted to `system` so a non-system actor cannot use a no-op write to bypass the "only the payment system marks an order paid" rule.
- `canOverrideTo` is intentionally **not** a widened `canTransition`; reusing the table would defeat the override's purpose of skipping a `from` gate.
- `orderActionsFor` uses `statusesReachableFrom` (which excludes the current status) for the `cancel` boolean, not `canTransition` (which allows `from === to`), so an already-cancelled order correctly reports `cancel: false`.
- The `pay` field in `orderActionsFor` is computed as `isPayable(status)`, i.e. asked of `system`, because no client request *is* a payment transition — it only decides whether to show the card form.
