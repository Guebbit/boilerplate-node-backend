# src/modules/products/tests/unit/audit.test.ts

## Purpose

Unit test that pins the exact string values emitted by the products module's audit vocabulary. It exists because the action strings are a **wire contract** consumed by external log queries, dashboards, and alert rules — not an internal identifier safe to refactor. This file is the owner-level assertion that any change to a string (or the addition/removal of an action) is deliberate and documented.

## Key elements

- **`describe('the products audit vocabulary')`** — the single test suite.
- **Test: "spells every action exactly as the log tooling expects"** — asserts whole-object `toEqual` on `productsAuditActions`, catching both value changes and structural additions/removals in one failure.
- **Test: "registers its actions in the app-wide union"** — assigns a key from `productsAuditActions` to a variable typed `AuditAction`, verifying the `declare module` augmentation in `../../audit.ts` keeps the module's actions inside the app-wide union. Also asserts the literal string value.

## Relationships

- **`src/modules/products/audit.ts`** — imports `productsAuditActions`; this file is its value-pinning test.
- **`src/infrastructure/observability/audit.ts`** — imports the `AuditAction` type (the app-wide union augmented per-module via `declare module`). The second test exercises that augmentation at the type level.

## Notes

- Whole-object `toEqual` is used deliberately over per-key assertions: it fails on a changed value *and* on an action silently added or removed.
- The type-level assertion compiles under the full `tsconfig.json` (which includes all of `src`) even though Jest does not type-check; the `declare module` augmentation in `audit.ts` is the mechanism that makes it pass.
- Shape/cross-module uniqueness is covered separately by `tests/cross-cutting/audit-actions.test.ts`; this file is responsible only for the *values* owned by the products module.
- Deleting this test folder removes the only in-repo guarantee that the strings match what external tooling expects — every other test would still pass.
