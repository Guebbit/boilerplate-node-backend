---
source: src/modules/orders/services/actions.ts
sha256: 5138ef6d68d12f9ad3eb73d193d388e9125397d019f92fec342d82b988383be6
generated_at: 2026-11-14T20:41:30.495791+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/services/actions.ts

## Purpose

Computes the `actions` flag object attached to every order (single or list) that a caller may act upon. The state-derivation predicates live in `../domain` (shared with the write-path guard); this file layers caller identity (keys, ownership, buyer vs. operator) on top so no client re-derives the rules. The two exports — `withActions` and `withListActions` — are the only async surfaces: they resolve live images and (for lists) hydrate documents, then stamp the pure `orderActionsOf` result onto the wire shape.

## Key elements

- **`withActions`** (exported) — Serializes a single `OrderDocument`, resolves its current images, stamps the version counter (`carryVersion`), and attaches `orderActionsOf`. Returns `Promise<Order>`.
- **`withListActions`** (exported) — Takes a paginated page of `ExportOrder` rows, fetches the full documents in one `findByIds` call, and maps each row to an `OrderListItem` carrying its actions. Drops rows whose document vanished between the two reads.
- **`orderActionsOf`** (private) — The pure core: composes status predicates, permission checks, buyer/actor standing, and the individual action sub-functions into one `OrderActions` object. No I/O.
- **`startAndOverrideActions`** — Decides `process`, `correctAddress`, and `overrideStatus` (filtered by `shipsAwaitedStock`). Each requires a specific key (`start:Shipment`, `update:Order`, `override:Order`).
- **`withoutCancelOnceShipped`** — Strips `cancel` to `false` once `fulfillment.shipped` is true.
- **`canRecordPayment` / `holdsCheckout`** — Permission gates for the offline-payment button and the checkout flow.
- **`withdrawalActions`** — Buyer-only; returns `withdraw` plus a `withdrawBlocked` reason string when a refusal applies.
- **`deleteActions`** — `delete`, `hardDelete`, `restore` based on the `delete:Order` key and the order's deletion state.
- **`forStanding`** — Final narrowing: `cancel` suppressed for non-buyer customers; `pay` suppressed for operators.
- **`OrderForActions`** — Type alias (`Lean<OrderDocument>`) unifying the single-read and list-row document shapes the flags consume.

## Relationships

- **`../domain` (index + sub-modules: lifecycle, rules, withdrawal, deletion, fulfillment)** — Supplies every pure predicate (`orderActionsFor`, `canProcessOrder`, `canWithdraw`, `withdrawalRefusalOf`, `hardDeletable`, `softDeletable`, `isBuyer`, `isPayable`, `canCorrectAddress`, `overridableTargetsFrom`, `shipsAwaitedStock`, `isDigitalOnlyOrder`). This file is the *read-side* consumer of the same predicates the write-path guard uses, ensuring flag and guard cannot disagree.
- **`@kernel/permissions` / `@kernel/ability`** — `callerForSubject` resolves the caller's subject at tenant scope; `holds` checks a specific `(verb, resource)` key.
- **`../presenter`** — `presentOrder` / `presentOrderListItem` produce the wire shape onto which actions are attached.
- **`./current`** — `resolveCurrentImages` performs the sole non-pure I/O (a `$in` lookup for live line-item pictures) before actions are stamped.
- **`../repository`** — Provides the order repository used to hydrate lean list rows into full documents for `withListActions`.
- **`@infrastructure/persistence/versioning`** — `carryVersion` copies the edit counter onto the serialized order so a subsequent write (a restore) can answer with the real `ETag`.
- **`@infrastructure/persistence/create-repository`** — Provides the `Lean<T>` type used to type the document shape the flags read.
- **`@infrastructure/persistence/search`** — `PaginatedMeta` is the pagination metadata passed through `withListActions` unchanged.
- **`../model`** — `OrderDocument` is the full Mongoose document type.
- **`./scope`** — `actorOf` classifies the caller as `customer` or `operator`, feeding `forStanding`.

## Notes

- **`authContext` is optional.** Every helper short-circuits to `false`/empty when it is `undefined` (e.g. background jobs, system reads). This is intentional, not a bug.
- **`invoice` is a proxy, not a query.** It is `Boolean(order.paidAt)` — a same-module, zero-dependency stand-in for "an invoice exists." The real `GET /orders/{id}/invoice` endpoint (owned by the invoicing module) still 404s on the rare gap; the policy mirrors the existing `orderNumber` convention.
- **List hydration is a second read.** `withListActions` issues `findByIds` after the aggregation has already produced rows. If a document is deleted between the two reads the row is silently dropped (the contract is that an `OrderListItem` always carries `actions`).
- **`withdrawBlocked` is conditional.** The key is only present in the returned object when a refusal exists; clients should treat its absence as "no reason" rather than reading `undefined`.
- **The `process` / `overrideStatus` / `correctAddress` keys are deliberately NOT derived from `actorOf`'s customer/admin split.** A warehouse operator can hold `start:Shipment` without `update:Order`; each door is checked independently against the caller's own keys at the same tenant scope.
