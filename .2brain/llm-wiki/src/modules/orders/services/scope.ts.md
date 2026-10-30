---
source: src/modules/orders/services/scope.ts
sha256: fc615748544f00bd1cc2bf8b76124b9591040295e462ec1e57af250bf717f15a
generated_at: 2026-10-29T04:49:51.645227+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/services/scope.ts

## Purpose

Defines the authorization boundaries for order reads and writes: which orders a caller may see (`callerScope`, `ownerScope`, `ownLiveScope`), which orders a caller may cancel (`cancelScope`), and which lifecycle column a caller is mapped to (`actorOf`). Every sibling service in this directory consults these functions before issuing a query, so the "who sees what" logic lives in exactly one place.

## Key elements

- **`callerScope(context?)`** — Returns a query filter (always an object, `{}` for unrestricted roles) for which orders the caller may **read**. Delegates to `accessibleFilter(context, 'Order')`.
- **`cancelScope(authContext, ownOnly?)`** — Returns the filter for which orders the caller may **cancel**. Distinct from `callerScope` because a role that reads all orders (`display:Order`) is not necessarily allowed to cancel. When `ownOnly` is true (withdrawal path) or the actor is `customer`, scope narrows to the caller's own live orders.
- **`ownerScope(userId)`** — Filter for one account's orders by user id, **including** soft-deleted rows. Used when the caller already knows whose data to fetch (e.g. account export).
- **`ownLiveScope(userId)`** — Same as `ownerScope` but adds `deletedAt: null`. The single canonical spelling of "this buyer's own live orders."
- **`actorOf(authContext?)`** — Resolves the caller to an `OrderActor` (`'system' | 'admin' | 'customer'`) that selects the lifecycle column. Checks `isSystemActor` **before** any `holds()` call (see Notes).

## Relationships

- **`@kernel/access/query` → `accessibleFilter`** — the single function that compiles a role's rules into a query filter; used by `callerScope` and `cancelScope`.
- **`@kernel/ability` → `holds`** — permission-check primitive used inside `actorOf`.
- **`@kernel/permissions` → `callerForSubject`, `isSystemActor`** — identity helpers; `isSystemActor` gates the system-actor branch in `actorOf`, `callerForSubject` supplies the subject for the `holds` check.
- **`../repository` → `orderRepository`** — `ownerScope` delegates to `orderRepository.ownerScope(userId)`.
- **`../domain` → `OrderActor`** — return type of `actorOf`; the value drives which column `lifecycle.ts` reads.
- **`../domain/lifecycle.ts`** — consumes `actorOf`'s result to pick the `pending` / `cancelled` / `system` column rules.
- **`./cancel.ts`** — primary consumer of `cancelScope` (and `actorOf`).
- **`./read.ts`** — primary consumer of `callerScope`.
- **`./export.ts`** — consumes `ownerScope` for account-level data exports.
- **`./actions.ts`** — the "what may be done to one order" counterpart referenced in this module's docstring.
- **`./index.ts`** — barrel re-export for the services directory.

## Notes

- **`actorOf` checks `isSystemActor` before `holds`.** `SYSTEM_ACTOR` carries `roles.tenant: 'admin'` so a naïve `holds(…, 'update', 'Order')` check would classify it as `'admin'` and hand it the wider `cancelled` rule — the exact race the `pending.cancelled` comment in `lifecycle.ts` describes. The identity check must come first.
- **`callerScope` returns `{}`, never `undefined`.** Both spread identically into a query object, but `{}` is the honest "no conditions" shape.
- **Read scope ≠ write scope.** `cancelScope` is a separate function by design; an operator with `display:Order` but not `update:Order` must not inherit the read filter for a write.
- **`ownerScope` intentionally includes soft-deleted rows.** Use `ownLiveScope` when you need only live orders; never hand-build `deletedAt: null` in a sibling module.
- **`cancelScope`'s `ownOnly` parameter** models the withdrawal right (buyer-only). It is never an operator's authority; passing it for a non-customer actor would be a logic error at the call site.
