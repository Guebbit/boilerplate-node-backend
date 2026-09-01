# src/modules/orders/tests/unit/service-scope.test.ts

## Purpose

Unit tests for `orderService.callerScope`, the authorization boundary that determines which orders a caller can read. Covers the three outcomes — admin (no restriction), non-admin (scoped to own `userId` excluding soft-deleted rows), and no-auth (throws) — plus the type-safety requirement that the scope carries a BSON `ObjectId`, not a string.

## Key elements

- **`orderService.callerScope(ctx)`** (under test) — returns `undefined` for admins, `{ userId: ObjectId, deletedAt: { $exists: false } }` for non-admins, or throws when no valid auth context is provided.
- **Admin path** — asserts the return is strictly `undefined` (not `{}` or `null`), so spreading it into a Mongoose query adds no filter.
- **Non-admin / soft-delete axis** — two separate tests: one verifies the full object shape, the other isolates `deletedAt: { $exists: false }` to confirm soft-deleted orders are excluded even from their own owner.
- **Fail-safe assertions** — `admin` flag absent → treated as non-admin; `ctx` is `undefined` → throws; `ctx.id` missing → throws; `ctx.id` malformed → throws.
- **ObjectId type guard** — asserts `scope.userId` is an instance of `Types.ObjectId` and not a plain string, because `$match` inside an aggregation pipeline skips Mongoose schema casting.

## Relationships

- **`src/modules/orders/index.ts`** — the barrel re-export; the test imports `orderService` from `@modules/orders` (this barrel), not directly from the service file.
- **`src/modules/orders/service.ts`** — defines `orderService` and its `callerScope` method; this test file exercises that method in isolation with no database or repository involved.

## Notes

- The admin assertion uses `toBeUndefined()` deliberately; a `{}` object would spread into a filter that matches nothing, which would be a silent data-loss bug. The test documents *why* `toBeFalsy()` is insufficient.
- Soft-delete uses `$exists: false` rather than `deletedAt: null` because the `remove` operation *unsets* the field (restore = delete key). A `null` check would miss restored rows that still carry a stale `null`.
- The ObjectId test exists because a string ID would pass a loose `toEqual` on the id value but silently match zero documents inside an aggregation pipeline — the most dangerous failure mode this file guards against.
- No mocking or database is used; the test validates the pure decision logic of `callerScope` at the contract level.
