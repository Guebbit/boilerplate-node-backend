---
source: src/modules/orders/domain/lifecycle.ts
sha256: 3420eaccd8b3eca2031eb172715d07b8d50a5ce2fb16dfe282f523bb636409c9
generated_at: 2026-10-15T11:01:58.886541+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/domain/lifecycle.ts

## Purpose

Declares the order status-transition graph: which status may follow which, and which actor may make each move. The set of statuses itself comes from the contract (`@types`); this file adds the directed edges, binds the allowed actor to each edge, and provides the query functions services use to gate writes, build conditional-update `from` sets, and render available actions to clients.

## Key elements

- **`OrderActor`** (type) — Union of five actors: `customer`, `admin`, `system`, `withdrawal`, `fulfilment`. `system` is not a privilege rank; it marks moves no human makes by hand.
- **`OrderEvent`** (interface) — Shape of one lifecycle edge: `from[]`, `to`, `actors[]`.
- **`ORDER_EVENTS`** (const, `satisfies Record<string, OrderEvent>`) — The full transition table: `pay`, `start`, `ship`, `deliver`, `fulfilmentComplete`, `expire`, `cancel`, `cancelUnanswered`, `cancelInFulfilment`.
- **`OrderEventName`** (type) — `keyof typeof ORDER_EVENTS`; names a service passes to the repository's conditional write.
- **`canTransition(from, to, actor)`** — Core guard: does a declared edge exist for this (from, to, actor) triple? Self-transitions are never allowed.
- **`isPayable(status)`** — Wrapper around `canTransition` asking the single question every payment door needs: may a `system` actor move this status to `paid`?
- **`paymentSettled(status)`** — Reads `ORDER_STATUS_TRAITS[status].stockCommitted`; the one place "has payment cleared?" is declared.
- **`canOverrideTo(from, to, digitalOnly?)`** — Forward-only admin override rule over `OVERRIDABLE_SEQUENCE` (`paid → processing → shipped → delivered`). Deliberately independent of `canTransition` so an override can skip a normal `from` gate.
- **`overridableTargetsFrom(from, digitalOnly?)`** — All legal override destinations from `from`.
- **`statusesReachableFrom(from, actor)`** — All `to`-statuses the actor can reach from `from` (excludes `from` itself); feeds 409 responses and `orderActionsFor`.
- **`statusesLeadingTo(to, actor)`** — All `from`-statuses that may precede `to`; the `from` set handed to `updateStatusIfIn`.
- **`orderActionsFor(status, actor)`** — Returns `{ transitions, cancel, pay }` derived purely from status/actor; permission-key actions (`start`, `ship`, `deliver`, `override`) are merged in later by `services/scope.ts`'s `withActions`.

## Relationships

- **`./status-traits.ts`** — Imports `ORDER_STATUS_TRAITS`; `paymentSettled` reads `stockCommitted` from it.
- **`@types` (`src/types/index.ts`)** — Source of `OrderStatus` (the status enum) and `OrderActions` (the full client-facing action shape this file partially answers).
- **`../domain/index.ts`** — Barrel file that re-exports this module's public API.
- **`../services/cancel.ts`** — Calls `canTransition` / `statusesLeadingTo` to gate and scope cancel writes.
- **`../services/override.ts`** — Calls `canOverrideTo` and `overridableTargetsFrom` to validate and enumerate admin override moves.
- **`../services/scope.ts`** — Imports `orderActionsFor` and merges it with permission-key-derived actions via `withActions`.
- **`../services/status.ts`** — Calls `canTransition` / `statusesLeadingTo` for status-change requests.
- **`../tests/unit/lifecycle.test.ts`** — Unit tests for every exported function.
- **`src/modules/payments/services/settlement.ts`** — Calls `isPayable` before recording a settlement.
- **`src/modules/payments/services/intent.ts`** — Calls `isPayable` to decide whether to create a payment intent.
- **`src/modules/payments/services/offline.ts`** — The "offline-payment door" referenced in comments; the only path out of `pending` for non-system actors.
- **`src/modules/payments/services/view.ts`** — Reads `paymentSettled` to determine hold/commit state in payment views.

## Notes

- **Actor semantics are intentionally non-hierarchical.** `system` is narrower than `admin` (it covers moves no human initiates), `withdrawal` is a statutory right (EU Directive Art. 9) wider than `customer`, and `fulfilment` is separated from `system` so the reservation sweep can never reach a paid order.
- **`canOverrideTo` ≠ widened `canTransition`.** It exists to skip a `from` gate; reusing the normal table here would defeat the override feature.
- **`pending` is absent from `OVERRIDABLE_SEQUENCE`.** Leaving `pending` is only legal through the offline-payment door; no override may target or originate from it.
- **`orderActionsFor` deliberately uses `statusesReachableFrom`, not `canTransition`,** to exclude the no-op self-transition when answering "may I cancel / pay this order."
- **`digitalOnly` parameter** excludes `shipped` as an override target, because a digital-only order goes `processing → delivered` with no parcel to ship.
- **`as const satisfies`** on `ORDER_EVENTS` gives literal-key access while still enforcing the `OrderEvent` shape without widening.
