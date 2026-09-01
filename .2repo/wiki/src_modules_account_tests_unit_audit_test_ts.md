# src/modules/account/tests/unit/audit.test.ts

## Purpose

Unit test that pins the account module's audit action strings to their exact wire-contract values. Because these strings are consumed by dashboards and alert rules outside this repo, the test locks them in place so a silent rename surfaces as a test failure rather than a broken downstream pipeline.

## Key elements

- **`describe('the account audit vocabulary')`** — top-level suite; no exports, no helper functions.
- **`it('spells every action exactly as the log tooling expects')`** — deep-equals `accountAuditActions` against a literal object of 15 `auth.*` strings. This is the primary guard against accidental renames.
- **`it('keeps the `auth.` prefix the folder name does not control')`** — iterates every value and asserts the `auth.` prefix, catching a new action that slips in under the folder name (`account.*`) and would otherwise pass the cross-cutting shape check.
- **`it('registers its actions in the app-wide union')`** — assigns one action to a variable typed as `AuditAction` (the global union augmented via `declare module` in the sibling `audit.ts`). Type-checks at build time; confirms the augmentation is still wired.

## Relationships

- **`src/modules/account/audit.ts`** — the unit under test. Exports `accountAuditActions`, the frozen record of action constants this file asserts against.
- **`src/infrastructure/observability/audit.ts`** — defines the `AuditAction` type (a global string-literal union). The third test case imports it to verify that the account module's `declare module` augmentation feeds into that union.

## Notes

- The tests are **value-pinned**, not shape-only. A cross-cutting sweep (`tests/cross-cutting/audit-actions.test.ts`) checks uniqueness and lower-snake-case across all modules, but it cannot assert specific strings without importing every domain; this file is the per-domain authority on exact values.
- The `AuditAction` union registration (third test) is enforced **at type-check time** by `tsc` over the whole `src` tree. Jest itself does not type-check, so a broken augmentation would fail in CI's build step, not in `jest`.
- The wire prefix is `auth.`, not `account.`, despite the folder name. The dedicated prefix test exists precisely because the mismatch is non-obvious and would pass every other structural check.
