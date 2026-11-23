---
source: src/modules/orders/tests/unit/service-scope.test.ts
source_sha256: 0604057245c1f3a5560f9de821679d1dde6efccc3824a59a6dbebc3d19b8f21e
context_sha256: 903d84dde7f5a9ac610c76bf3588ac8f8a5df785d823c0ace85a465bcd47be82
generated_at: 2026-11-22T06:38:10.969112+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/orders/tests/unit/service-scope.test.ts

## Purpose
Unit tests for the order service's read-authorization helpers. They pin `orderService.callerScope`, the boundary that decides which orders a caller may read, and two related helpers, `actorOf` and `ownLiveScope`. The tests assert the exact shapes returned, so a gap in identity or rules can never widen a read.

## Key elements
- **`USER_ID` / `MATCHES_NOTHING`**: test constants. `USER_ID` is a 24-hex id string. `MATCHES_NOTHING` is `{ $expr: { $eq: [0, 1] } }`, which is what CASL compiles a caller with no matching rule to.
- **`describe('orderService.callerScope')`**:
  - A role that reads everything (admin) gets exactly `{}`, not `undefined`, and the result has no `deletedAt` key, so soft-deleted orders stay visible.
  - A customer gets `{ userId: new Types.ObjectId(USER_ID), deletedAt: null }`. The scope hides soft-deleted orders even from their owner.
  - An `undefined` auth context, or a customer with an empty id (`asCustomer('')`), gets `MATCHES_NOTHING`.
- **`describe('actorOf')`**: maps a caller to the lifecycle column they act on.
  - Customer gives `'customer'`.
  - Admin gives `'admin'`.
  - Moderator gives `'admin'`. This is a regression pin: `update:Order` is held by name, not through the wildcard, so a moderator was once treated as a customer.
  - `undefined` gives `'customer'`.
- **`describe('orderService.ownLiveScope')`**: asserts it equals `{ ...orderService.ownerScope(USER_ID), deletedAt: null }`.

## Relationships
- **`src/modules/orders/services/index.ts`**: provides `orderService`, the object under test (`callerScope`, `actorOf`, `ownLiveScope`, `ownerScope`).
- **`tests/support/callers.ts`**: imported via the `@tests/callers` alias. Supplies the caller fixtures `asCustomer`, `asAdmin` and `asModerator`, which take a user id.

## Notes
- The filter's `userId` must be a real `Types.ObjectId`. `$match` inside an aggregation skips schema casting, so a string id would match no orders instead of raising an error.
- An unresolvable identity placeholder drops the whole rule. It does not resolve to `{ userId: null }`, which would match unowned rows.
- Missing identity fails closed: the request gets an empty list rather than a raise (a 500) or a wider read.
