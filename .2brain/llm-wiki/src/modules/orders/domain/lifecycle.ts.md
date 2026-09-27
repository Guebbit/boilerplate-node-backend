---
source: src/modules/orders/domain/lifecycle.ts
sha256: fda4c50e5cc3b9db18df100798dff25f9ecea91ead98734121b7d699c847e67f
generated_at: 2026-09-27T15:09:12.447144+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/domain/lifecycle.ts

## Purpose

Defines the order-status state machine: which status may follow which, and which actor (`customer`, `admin`, `system`) is permitted on each edge. The status *set* comes from the `OrderStatus` contract in `@types`; this file supplies the edges and actor constraints. It also provides the derived predicates (`isPayable`, `stockCommitted`, `canOverrideTo`) and the helper enumerations that service layers and payment modules use instead of hand-listing status literals.

## Key elements

- **`OrderActor`** — union `'customer' | 'admin' | 'system'`. `system` is *narrower* than `admin` (moves nobody makes by hand), not a higher rank.
- **`ORDER_LIFECYCLE`** — `Readonly Record<OrderStatus, Partial<Record<OrderStatus, readonly OrderActor[]>>>`. Total over every status; terminal states carry `{}`. A new contract status without an entry is a compile error.
- **`canTransition(from, to, actor)`** — single source of truth for "is this write legal?" Special-cases `from === to`: always allowed *except* into `paid` (where only `system` may echo-write).
- **`isPayable(status)`** — "can a *new* payment land?" Returns `true` only for `pending`. Deliberately stricter than `canTransition(paid→paid, 'system')`.
- **`stockCommitted(status)`** — `true` for `paid` and beyond; `false` for `pending` and `cancelled`.
- **`canOverrideTo(from, to)`** — forward-only admin override check. Only lands on `processing`/`shipped`/`delivered`. Independent of `ORDER_LIFECYCLE` by design.
- **`overridableTargetsFrom(from)`** / **`statusesOverridableInto(to)`** — the two directions of the override sequence; the latter produces the `from`-set passed to `updateStatusIfIn`.
- **`statusesReachableFrom(from, actor)`** / **`statusesLeadingTo(to, actor)`** — enumerate all legal targets/sources in contract order; feed 409 responses and conditional writes.
- **`StatusDerivedActions`** / **`orderActionsFor(status, actor)`** — returns `{ transitions, cancel, pay }` for client rendering. Uses `statusesReachableFrom` (not `canTransition`) so that "may I cancel an already-cancelled order" is correctly `false`.

## Relationships

- **`src/types/index.ts`** — imports `OrderStatus` (enum) and `OrderActions` (type). The lifecycle table is keyed on `OrderStatus`; `orderActionsFor` returns a `Pick<OrderActions, …>`.
- **`src/modules/orders/services/status.ts`** — its `markProcessing`, `markShipped`, `markDelivered`, and private `markSystemMove` call `canTransition` / `statusesLeadingTo` and pass the result to the repository's `updateStatusIfIn`.
- **`src/modules/orders/services/override.ts`** — calls `canOverrideTo`, `overridableTargetsFrom`, and `statusesOverridableInto` to gate and shape admin override writes.
- **`src/modules/orders/services/cancel.ts`** — checks `canTransition(_, cancelled, actor)` before executing the cancel sequence.
- **`src/modules/orders/services/scope.ts`** — `withActions` merges permission-key-derived actions (`start`, `ship`, `deliver`, `override`) on top of `orderActionsFor`.
- **`src/modules/payments/services/intent.ts`** / **`offline.ts`** / **`effects.ts`** — query `isPayable` before creating or settling a payment.
- **`src/modules/delivery/service.ts`** — the actor that *triggers* `paid→processing`, `processing→shipped`, `shipped→delivered` as `system`; never a direct admin write.
- **`src/modules/orders/domain/index.ts`** — barrel re-export of this module for external importers.
- **`src/modules/orders/tests/unit/lifecycle.test.ts`** — unit-tests every exported predicate.

## Notes

- **Echo-write carve-out.** `canTransition` allows `from === to` as a no-op, but *blocks* `paid → paid` for any actor other than `system`. This prevents a client echo from looking like a legitimate payment. `isPayable` closes the same gap from the payment side.
- **`system` is not seniority.** It denotes moves that are *machine-only* (reservation-sweep expiry, fulfilment milestones). An admin or customer can still cancel `paid` or `processing`; the sweep (`system`) cannot.
- **Override ≠ widened transition.** `canOverrideTo` deliberately bypasses the `ORDER_LIFECYCLE` table. Reusing `canTransition` here would make the override a no-op, since the override's purpose is to skip a `from`-gate the normal lifecycle enforces.
- **`statusesOverridableInto` is the conditional-write `from`-set.** It produces the array handed to `updateStatusIfIn` in `../repository.ts`, which is what actually makes one racing writer win. The lifecycle table only decides *which* `from` set is legal.
- **`orderActionsFor` asks `pay` as `system`.** Paying is never a request the client makes; the predicate exists so the client knows whether to render a card form. It is intentionally absent from `transitions`.
