# src/modules/cart/tests/unit/audit.test.ts

## Purpose

Pins the exact string values emitted by the cart module's audit actions. Because these strings are a **wire contract** consumed by external log queries, dashboards, and alert rules (not refactored alongside this repo), a whole-object equality assertion guards against silent drift that would still type-check and pass all other tests while breaking downstream tooling.

## Key elements

- **`describe('the cart audit vocabulary')`** – the single test suite in this file.
- **Test: "spells every action exactly as the log tooling expects"** – asserts `cartAuditActions` with whole-object `toEqual` against the two expected entries (`user.cart.item_removed`, `user.cart.reordered`). Fails on a changed value *and* on an action added or removed without a deliberate update here.
- **Test: "registers its actions in the app-wide union"** – assigns a cart action to a variable typed as `AuditAction`, proving the `declare module` augmentation in `cart/audit.ts` includes cart's actions in the global union. Validated at type-check time, not at jest runtime.

## Relationships

- **`src/modules/cart/audit.ts`** – source of `cartAuditActions`, the object under test. Its `declare module` augmentation is what makes the second test's assignment type-check.
- **`src/infrastructure/observability/audit.ts`** – defines the `AuditAction` type (a union across all modules) that the second test references.

## Notes

- The second test is a **type-level** assertion: jest does not type-check, but `tsconfig.json` includes the whole `src` tree, so removing the augmentation breaks compilation, not a runtime test.
- Cross-cutting shape validation (dotted lower_snake_case, uniqueness across modules) lives in `tests/cross-cutting/audit-actions.test.ts`; this file deliberately only asserts *values*, because asserting values requires naming the domain and would couple all modules together.
- Deleting this directory removes the only in-repo guard on the cart action strings.
