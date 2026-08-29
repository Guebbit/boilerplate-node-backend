# src/modules/users/tests/unit/audit.test.ts

## Purpose

Pins the exact string values of the users module's audit-action constants. These strings are wire contracts consumed by external log queries, dashboards, and alert rules; a silent rename or reword would break those consumers without any type error or test failure in other modules. This file is the owner-level guard that catches such drift.

## Key elements

- **`describe('the users audit vocabulary')`** — top-level suite.
- **"spells every action exactly as the log tooling expects"** — asserts whole-object equality (`toEqual`) of `usersAuditActions` against the literal map `{ ADMIN_USER_CREATED: 'admin.user.created', ADMIN_USER_UPDATED: 'admin.user.updated', ADMIN_USER_DELETED: 'admin.user.deleted' }`. Catches changed values *and* actions added/removed.
- **"registers its actions in the app-wide union"** — assigns `usersAuditActions.ADMIN_USER_CREATED` to a variable typed `AuditAction`, proving the `declare module` augmentation in `src/modules/users/audit.ts` is in effect. Enforced at type-check time (tsconfig includes the full `src` tree), not by Jest at runtime.

## Relationships

- **`src/modules/users/audit.ts`** — the system under test; exports `usersAuditActions` and contains the `declare module` augmentation that widens the global `AuditAction` union.
- **`src/infrastructure/observability/audit.ts`** — provides the `AuditAction` type (imported as a type-only import) used by the second test.

## Notes

- The file's block comment documents *why* value-pinning lives here rather than in `tests/cross-cutting/audit-actions.test.ts`: the cross-cutting test verifies shape (presence, uniqueness, naming convention) across all modules but deliberately does not name per-domain values to avoid coupling. This module-owned test owns the values; deleting this folder deletes the pin.
- Whole-object `toEqual` is intentional: a per-key `toBe` suite would pass if an action were silently added or removed.
- The second test's value assertion (`toBe('admin.user.created')`) is a redundant safety net; the real work is done by the TypeScript compiler rejecting the assignment if the augmentation is missing. Jest never type-checks, but `tsc --noEmit` across the whole `src` tree does.
