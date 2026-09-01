# src/modules/users/tests/unit/audit.test.ts

## Purpose

Pins the exact string values of the users audit action constants so they match the wire contract consumed by external log queries, dashboards, and alerts. Uses whole-object equality to catch any added, removed, or reworded action.

## Key elements

- **`describe('the users audit vocabulary')`** — test suite for the users audit vocabulary.
- **`it('spells every action exactly as the log tooling expects')`** — asserts `usersAuditActions` equals the full object `{ ADMIN_USER_CREATED: 'admin.user.created', ADMIN_USER_UPDATED: 'admin.user.updated', ADMIN_USER_DELETED: 'admin.user.deleted' }` via `toEqual`.
- **`it('registers its actions in the app-wide union')`** — assigns `usersAuditActions.ADMIN_USER_CREATED` to a variable typed as `AuditAction`, verifying the module augmentation in `audit.ts` actually widens the union.

## Relationships

- **`src/modules/users/audit.ts`** — source of `usersAuditActions`; its `declare module` augmentation is what makes the second test's type assignment valid.
- **`src/infrastructure/observability/audit.ts`** — defines the `AuditAction` type imported for the type-level check in the second test.

## Notes

- The second test is a **compile-time check only**. Jest does not type-check; the assertion passes at runtime regardless. Its real value is forcing `tsc` (via `tsconfig.json`) to verify the `declare module` augmentation in `audit.ts` is present and correct.
- Whole-object equality (not per-key checks) is deliberate: it guarantees the set of keys is exactly the three listed, catching accidental additions or removals.
