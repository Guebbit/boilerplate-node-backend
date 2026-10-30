---
source: src/modules/orders/services/actions.ts
sha256: f53a06510bfa3823126c7126dc35d410c9ed8369d39cf574901e068d95fcedd5
generated_at: 2026-10-29T04:45:18.841932+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/services/actions.ts

## Purpose

Computes the full set of actions a caller may perform on an order by combining status-based rules (imported from `../domain`) with the caller's permission keys (from the kernel). Exposes the result on wire shapes so the API response tells each client exactly which buttons are live, eliminating client-side re-derivation of eligibility rules.

## Key elements

- **`orderActionsOf(order, authContext)`** — Pure, synchronous core. Reads the order document's fields plus the caller's keys and returns an `OrderActions` object (process, override, correctAddress, cancel, pay, withdraw, withdrawBlocked, recordPayment, delete, hardDelete, restore, invoice). No I/O.
- **`withActions(order, authContext?)`** — Async wrapper for a single-order response. Serializes via `presentOrder`, resolves live product images, then attaches `actions` to the wire shape.
- **`withListActions(page, authContext?)`** — Async wrapper for a paginated list. Issues one bulk `$in` lookup through `orderRepository.findAll` to fetch the documents the flags need, then maps `orderActionsOf` over each row. Rows whose documents vanish between the list read and the document read are dropped.
- **Internal helpers** (not exported): `startAndOverrideActions`, `withoutCancelOnceShipped`, `canRecordPayment`, `holdsCheckout`, `withdrawalActions`, `deleteActions`, `forStanding` — each isolates one concern (shipping start, cancel suppression, manual payment, checkout key, buyer withdrawal, deletion tier, customer/admin standing).
- **`OrderForActions`** type alias — `Lean<OrderDocument>`, the minimal shape the flags read from (works for both hydrated documents and lean aggregation rows).

## Relationships

- **`src/modules/orders/domain/index.ts`** (barrel) — Source of all status predicates: `orderActionsFor`, `canProcessOrder`, `overridableTargetsFrom`, `isDigitalOnlyOrder`, `isPayable`, `canCorrectAddress`, `canWithdraw`, `withdrawalOf`, `shipsAwaitedStock`, `isBuyer`, `hardDeletable`, `softDeletable`. This file adds only the *caller* dimension on top of those pure state checks.
- **`src/kernel/permissions.ts`** — `callerForSubject` resolves the caller's permission key for the `Order` resource at the request's tenant scope.
- **`src/kernel/ability.ts`** — `holds(caller, verb, resource)` checks whether the resolved key grants a specific ability (e.g. `start:Shipment`, `override:Order`, `delete:Order`).
- **`src/modules/orders/model.ts`** — `OrderDocument` type used by `OrderForActions`.
- **`src/modules/orders/repository.ts`** — `orderRepository.findAll` is called in `withListActions` to hydrate documents for the per-row flag computation.
- **`src/modules/orders/presenter.ts`** — `presentOrder` serializes a single document into wire shape before `withActions` attaches actions.
- **`src/modules/orders/services/current.ts`** — `resolveCurrentImages` performs the one async `$in` lookup (live product pictures) inside `withActions`.
- **`src/infrastructure/persistence/create-repository.ts`** — `toObjectId` (id coercion for the bulk lookup) and `Lean` (type alias for lean rows).
- **`src/infrastructure/persistence/search.ts`** — `PaginatedMeta` type used in the `withListActions` return shape.
- **`src/modules/orders/services/index.ts`** — Re-exports this module's public API.

## Notes

- **Cancel vs. returns:** Once any fulfillment has `shipped`, the whole-order `cancel` flag is forced to `false`. Per-fulfillment cancellation moves to the `returns` flow (`GET /returns/options`).
- **`invoice` is a proxy:** `Boolean(order.paidAt)` stands in for "an invoice exists." The real check lives in `GET /orders/{id}/invoice` (owned by `invoicing`), which 404s on the rare gap this flag cannot see.
- **Pay is buyer-only:** `forStanding` suppresses `pay` for any non-buyer actor, even if the operator holds the `checkout:Cart` key.
- **`withListActions` drops vanished rows:** If a document is deleted between the list query and the document re-fetch, that row is silently removed rather than returned without `actions` (the `Order` type requires them).
- **`actorOf` is imported from `./scope`** (not listed as a graph neighbor here) to determine whether the caller reads as `customer` or `operator` for the standing gate.
