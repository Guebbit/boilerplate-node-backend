# src/modules/orders/tests/unit/service-scope.test.ts

## Purpose

Unit tests for `orderService.callerScope`, the authorization boundary that determines which orders a caller can read. It verifies three invariants: admins get an unrestricted scope (`undefined`), non-admins get a filter scoped to their own `userId` excluding soft-deleted rows, and an absent/invalid auth context throws rather than silently widening access.

## Key elements

- **`describe('orderService.callerScope')`** — nine assertions covering:
  - Admin → `undefined` (spreads to no filter)
  - Non-admin → `{ userId: ObjectId, deletedAt: { $exists: false } }`
  - Soft-deleted rows hidden from the owner (`$exists: false` check)
  - Admins see soft-deleted rows (scope is `undefined`)
  - Absent `admin` flag treated as non-admin (fail-safe default)
  - `userId` is a `Types.ObjectId` instance, not a plain string (pipeline `$match` requires it)
  - `callerScope(undefined)` throws
  - `callerScope({ admin: false })` (no `id`) throws
  - `callerScope({ id: 'not-an-object-id', … })` throws
- **`USER_ID`** — constant hex string used across all cases.

## Relationships

- **`src/modules/orders/index.ts`** — the barrel file that re-exports `orderService`; the test imports `orderService` from `@modules/orders`, which resolves here.
- **`src/modules/orders/service.ts`** — defines `callerScope`; the test exercises it through the index re-export. The implementation delegates the ObjectId coercion to `orderRepository.ownerScope`, and these tests assert the composed result is correct end-to-end.

## Notes

- The admin case asserts `toBeUndefined()` specifically, not `toBeFalsy()` — an empty object `{}` would be falsy-adjacent but would spread into a filter matching zero documents.
- The ObjectId-type test uses `toBeInstanceOf(Types.ObjectId)` in addition to a value check, because a string id would pass a loose `toEqual` but silently match nothing inside an aggregation pipeline.
- Soft-delete exclusion uses `$exists: false` (not `null`) because the `remove` operation unsets the field; the test pins this exact shape.
- The file header comment explicitly calls out three distinct data-leak vectors the suite guards against; if a test is removed, confirm the corresponding vector is still covered elsewhere.
