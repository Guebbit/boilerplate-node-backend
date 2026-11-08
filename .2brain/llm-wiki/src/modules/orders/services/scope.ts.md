---
source: src/modules/orders/services/scope.ts
sha256: d808df9eb1f4498af89e3ed20f3a3d5fe50789cfd16df8d91becb2a517041257
generated_at: 2026-11-08T07:00:46.265404+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/services/scope.ts

## Purpose

Defines the authorization scoping layer for order reads and writes. Before any sibling service reads, cancels, or exports an order, it consults the functions here to get the correct query filter (which rows the caller may touch) and the correct lifecycle actor column. It centralizes the "who sees what" decision so individual services never re-derive permissions inline.

## Key elements

- **`callerScope(context?)`** — Returns a query filter (`Record<string, unknown>`) of orders the caller may *read*, built via `accessibleFilter(context, 'Order')`. Returns `{}` (never `undefined`) when the role is unrestricted.
- **`cancelScope(authContext, ownOnly?)`** — Returns the query filter for orders the caller may *cancel*. Splits on the `update:Order` ability rather than the read key; `ownOnly = true` (withdrawal) forces the buyer's own live orders.
- **`ownerScope(userId)`** — Returns the filter for one account's orders by id **including** soft-deleted rows. Delegates to `orderRepository.ownerScope`.
- **`ownLiveScope(userId)`** — Same as `ownerScope` but appends `deletedAt: null`, giving the single canonical "this buyer's own live orders" filter.
- **`actorOf(authContext?)`** — Returns `'system' | 'admin' | 'customer'`, selecting which column of the lifecycle table applies. Checks `isSystemActor` **before** any `holds()` call because `SYSTEM_ACTOR` carries admin-level roles.

## Relationships

- **`@kernel/permissions`** — Imports `callerForSubject` and `isSystemActor` for identity/subject resolution in `actorOf`.
- **`@kernel/ability`** — Imports `holds` to test the `update:Order` ability in `actorOf`.
- **`@kernel/access/query`** — Imports `accessibleFilter`, the single encoding of "own AND still there" that every scope function trusts.
- **`@types`** — Imports the `AuthContext` type used as the caller parameter.
- **`../repository`** — Calls `orderRepository.ownerScope(userId)` inside `ownerScope`.
- **`../domain`** — Imports the `OrderActor` union type used as `actorOf`'s return.
- **`../domain/lifecycle.ts`** — The actor string returned by `actorOf` indexes into the lifecycle column rules defined there.
- **`./actions.ts`** — Per the module docstring, actions handle "what the caller may do to one order" after scope has narrowed *which* order.
- **`./cancel.ts`** — Consumes `cancelScope` (and `ownLiveScope`) to bound the rows a cancel operation may affect.
- **`./export.ts`** — Consumes `ownerScope` to pull all of an account's orders (including soft-deleted) for data export.
- **`./read.ts`** — Consumes `callerScope` as the read authorization boundary.

## Notes

- **`callerScope` returns `{}`, not `undefined`.** Both spread identically into a query, but `{}` is the honest shape for "no restriction"; `undefined` would be ambiguous.
- **`actorOf` checks `isSystemActor` first.** `SYSTEM_ACTOR` carries `roles.tenant: 'admin'`, so a `holds(..., 'update', 'Order')` check alone would misclassify the reservation-sweep caller as a plain admin and hand it the wider `canceled` rule — the exact race `lifecycle.ts`'s `pending.canceled` comment warns about.
- **Read scope ≠ write scope.** `cancelScope` deliberately keys off `update:Order`, not the read ability. An operator with `display:Order` can see every order but may still be restricted on cancellation.
- **`ownerScope` includes soft-deleted rows; `ownLiveScope` does not.** Sibling modules should use `ownLiveScope` whenever "still exists" is the intent, so they never need to know the `deletedAt` sentinel.
