# src/modules/account/tests/unit/audit.test.ts

## Purpose

Pins the exact string values of the account module's audit actions, because those strings are wire contracts consumed by external log queries, dashboards, and alert rules that live outside this repo. Deleting this file does not break the build or the cross-cutting shape test; it silently leaves the values unasserted.

## Key elements

- **`describe('the account audit vocabulary')`** — top-level suite with three tests.
- **`spells every action exactly as the log tooling expects`** — single `toEqual` against the full 15-entry `accountAuditActions` record; catches both a changed value and an added/removed key.
- **`keeps the auth. prefix the folder name does not control`** — loops over all values and asserts each starts with `auth.`, guarding the deliberate mismatch between the `account` folder name and the `auth.` wire prefix.
- **`registers its actions in the app-wide union`** — assigns one action to a typed `AuditAction` variable, verifying the `declare module` augmentation in the module's `audit.ts` actually folds the constants into the global union.

## Relationships

- **`src/modules/account/audit.ts`** — exports `accountAuditActions`, the record under test.
- **`src/infrastructure/observability/audit.ts`** — supplies the `AuditAction` type imported for the type-level registration check.

## Notes

- The test uses **whole-object equality** (`toEqual`) deliberately: one assertion covers value drift *and* unrecorded additions/removals.
- The `auth.` vs. `account` folder-name mismatch is intentional and only this test guards it; the cross-cutting sweep (`tests/cross-cutting/audit-actions.test.ts`) checks uniqueness and casing but not the prefix.
- The type-registration test compiles via `tsconfig.json` (which includes the whole `src` tree), not via jest's own type-checking. If the `declare module` augmentation in `audit.ts` is removed, this line still passes at runtime but `emitAuditEvent` call sites break at type-check time.
- Removing this test folder is safe for CI but leaves the wire strings unasserted — there is no other test that names the expected values.
