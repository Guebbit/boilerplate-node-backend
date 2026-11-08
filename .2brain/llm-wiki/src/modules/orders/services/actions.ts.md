---
source: src/modules/orders/services/actions.ts
sha256: 0e588de5f9b55d60cf97cf0dc64cfa390e350f39601c8447c236b2468a298fb7
generated_at: 2026-11-08T06:55:31.086487+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/services/actions.ts

## Purpose

Computes the full set of actions a caller may perform on an order by combining state-based rules (imported from `../domain`) with caller-specific checks (permission keys, buyer identity). It exposes two wire-level entry points — `withActions` for a single order response and `withListActions` for a paginated list — so that every order the API returns already carries its `actions` object and no client re-derives the rules.

## Key elements

- **`OrderForActions`** — type alias for `Lean<OrderDocument>`; the flags read only plain fields, so both a hydrated single read and a lean list row satisfy it.
- **`orderActionsOf(order, authContext)`** — pure, synchronous computation of the complete `OrderActions` object for one order. Assembles status-based actions, permission-gated actions, withdrawal, delete, payment, and invoice flags.
- **`withActions(order, authContext?)`** — async; serialises a single order via `presentOrder` + `resolveCurrentImages`, then attaches `orderActionsOf` to the wire shape.
- **`withListActions(page, authContext?)`** — async; reads back the full documents for a page of list rows in one `$in` query, then maps `orderActionsOf` over each. Drops rows whose document vanished between the two reads.
- **`startAndOverrideActions`** — computes `process`, `override`, and `correctAddress` using `start:Shipment`, `override:Order`, and `update:Order` keys plus domain predicates.
- **`withoutCancelOnceShipped`** — strips `cancel` from the action set once `fulfillment.shipped` is true.
- **`canRecordPayment`** — the operator's manual-payment button; requires `create:Payment` key and payable status.
- **`holdsCheckout`** — whether the caller holds `checkout:Cart`, gating the `pay` flag.
- **`withdrawalActions`** — computes `withdraw` (buyer-only, domain `canWithdraw`) and `withdrawBlocked` (refusal reason for UI).
- **`deleteActions`** — computes `delete`, `hardDelete`, and `restore` from the `delete:Order` key and domain predicates.
- **`forStanding`** — final gate: restricts `cancel` and `pay` to the buyer (customer actor) vs. an operator.

## Relationships

- **`src/kernel/ability.ts`** — `holds()` is called for every permission check in this file.
- **`src/kernel/permissions.ts`** — `callerForSubject(authContext, 'Order')` resolves the caller's key before each `holds` call.
- **`src/modules/orders/domain/index.ts`** — barrel import of all state predicates and helpers (`orderActionsFor`, `canProcessOrder`, `isBuyer`, `canWithdraw`, `withdrawalRefusalOf`, `hardDeletable`, `softDeletable`, `overridableTargetsFrom`, `shipsAwaitedStock`, `isDigitalOnlyOrder`, `isPayable`, `canCorrectAddress`) and the `OrderActor` type.
- **`src/modules/orders/domain/lifecycle.ts`** — source of `orderActionsFor` (status-derived action set).
- **`src/modules/orders/domain/withdrawal.ts`** — source of `canWithdraw`, `withdrawalRefusalOf`.
- **`src/modules/orders/domain/deletion.ts`** — source of `hardDeletable`, `softDeletable`.
- **`src/modules/orders/domain/rules.ts`** — source of `canProcessOrder`, `overridableTargetsFrom`, `isDigitalOnlyOrder`, `isPayable`, `canCorrectAddress`, `shipsAwaitedStock`.
- **`src/modules/orders/model.ts`** — provides `OrderDocument` (the document shape read back in `withListActions`).
- **`src/modules/orders/presenter.ts`** — `presentOrder` serialises the document into wire shape before `withActions` attaches actions.
- **`src/modules/orders/repository.ts`** — `orderRepository.findAll` fetches documents for `withListActions`.
- **`src/modules/orders/services/current.ts`** — `resolveCurrentImages` performs the async `$in` lookup for line-item pictures inside `withActions`.
- **`src/modules/orders/services/index.ts`** — barrel re-export of this module's public API.
- **`src/infrastructure/persistence/create-repository.ts`** — provides `toObjectId` (used to build the `$in` filter) and `Lean<T>` (used in `OrderForActions`).
- **`src/infrastructure/persistence/search.ts`** — provides `PaginatedMeta` for the list-page return shape.

## Notes

- `withListActions` performs a **second database read** (a `findAll` with `$in`) because the list aggregation rows are already wire shape and lack the fields the flags need. If a document is missing on that second read the row is silently dropped, not error-raised.
- The `invoice` flag is a **proxy** derived from `paidAt` being set; it does not query the invoicing module. The dedicated `GET /orders/{id}/invoice` endpoint still validates for real and can 404 in edge cases.
- `pay` and `cancel` are **buyer-only** after `forStanding` runs; an operator reading another user's order will see both as `false` regardless of their keys.
- `withdraw` is likewise buyer-only; an operator viewing the order will not see the button or the `withdrawBlocked` reason.
- The `override` array is pre-filtered by `shipsAwaitedStock` so no target that would 409 is ever offered to the client.
