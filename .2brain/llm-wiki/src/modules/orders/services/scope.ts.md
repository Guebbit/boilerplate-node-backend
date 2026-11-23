---
source: src/modules/orders/services/scope.ts
source_sha256: d808df9eb1f4498af89e3ed20f3a3d5fe50789cfd16df8d91becb2a517041257
context_sha256: e4a6ea9d34969728151ca8798083363762d62aa4f7f0d17d9e84443adc2834fe
generated_at: 2026-11-22T06:23:29.937181+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/orders/services/scope.ts

## Purpose
Answers two questions the rest of the orders services ask before they act: which orders a caller may read or cancel (the scope filters), and which lifecycle column applies to the caller (`actorOf`). It also gives sibling modules one spelling of "this buyer's own live orders", so they don't need to know that orders mark deletion with `deletedAt`.

## Key elements
- `callerScope(context?)`: the read boundary. Returns `accessibleFilter(context, 'Order')`, which is compiled from the caller's rules. It returns `{}` (never `undefined`) for roles that read everything.
- `cancelScope(authContext, ownOnly = false)`: the cancel boundary, which uses the `update` key rather than the read one.
  - Operators (`update:Order`) get the update scope.
  - Customers, and anyone cancelling with `ownOnly` (a withdrawal), get their own live orders through `ownLiveScope`.
  - A caller with no id gets `accessibleFilter(undefined, 'Order', 'update')`.
- `ownerScope(userId)`: delegates to the order repository's `ownerScope`. It covers one account's orders, including soft-deleted ones, and is used for data export.
- `ownLiveScope(userId)`: `ownerScope` plus `deletedAt: null`.
- `actorOf(authContext?)`: returns an `OrderActor` of `'system'`, `'admin'` or `'customer'`.
  - `'system'` if `isSystemActor` matches.
  - `'admin'` if the caller `holds` `update` on `Order`, checked via `callerForSubject(authContext, 'Order')`.
  - `'customer'` otherwise.

## Relationships
- `src/kernel/access/query.ts`: `accessibleFilter` builds the filters for `callerScope` and `cancelScope`.
- `src/kernel/permissions.ts`: provides `isSystemActor` and `callerForSubject`, both used by `actorOf`.
- `src/kernel/ability.ts`: `holds` performs the `update:Order` check in `actorOf`.
- `src/modules/orders/repository.ts`: its `orderRepository` backs `ownerScope`.
- `src/modules/orders/domain/index.ts`: supplies the `OrderActor` type.
- `src/modules/orders/domain/lifecycle.ts`: the comments point to it for the rule on the `canceled` transition from `pending`, which the `system` actor closes a race on.
- `src/types/auth-context.ts` / `src/types/index.ts`: supply the `AuthContext` type (imported from `@types`).
- `src/modules/orders/services/actions.ts`: per the module doc, it covers what a caller may do to a single order.

## Notes
- `SYSTEM_ACTOR` carries `roles.tenant: 'admin'` for ordinary permission checks, so `actorOf` must test `isSystemActor` first. Otherwise the reservation-sweep expiry would be treated as a plain admin and get the admin column's wider `canceled` rule.
- Reads and writes use different keys. Roles such as warehouse operators or support agents may hold `display:Order` without `update:Order`, so `callerScope` must not be used to scope a cancel.
- `actorOf` is gated on `update:Order` by name, not on a broader check, so moderators and managers are not reduced to the customer column.
- Withdrawal (`ownOnly`) is the buyer's own right, so even an operator is scoped to their own live orders.
- The comments name `cancelOnRequestById` as using the same `update:Order` key for its operator/customer split, and `account`'s data export as the user of `ownerScope`.
