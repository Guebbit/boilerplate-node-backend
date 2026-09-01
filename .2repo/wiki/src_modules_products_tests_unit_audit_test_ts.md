# src/modules/products/tests/unit/audit.test.ts

## Purpose

Pins the products module's audit action strings to their exact wire-format values and verifies they are registered in the app-wide `AuditAction` union. These strings are a cross-repo contract consumed by external log queries and alerts, so this test acts as a change-detector: any added, removed, or re-spelled action breaks CI immediately.

## Key elements

- **`describe('the products audit vocabulary')`** — suite scoped to the products audit vocabulary.
- **`it('spells every action exactly as the log tooling expects')`** — asserts `toEqual` against the full expected object (`ADMIN_PRODUCT_CREATED`, `ADMIN_PRODUCT_UPDATED`, `ADMIN_PRODUCT_DELETED` → their dot-notation strings). Whole-object equality means an *extra* or *missing* key fails the test, not just a renamed value.
- **`it('registers its actions in the app-wide union')`** — assigns a products action to a variable typed as `AuditAction`. This is a **compile-time check only**; the `expect(...).toBe(...)` line is a no-op guard to satisfy Jest's requirement of an assertion. If the `declare module` augmentation in `audit.ts` is removed, `tsc` fails at every `emitAuditEvent` call site and CI goes red.

## Relationships

- **`src/modules/products/audit.ts`** — source of the `productsAuditActions` object under test. Its `declare module` block extends `AuditAction` with the three products actions.
- **`src/infrastructure/observability/audit.ts`** — defines the `AuditAction` type (imported as `type` here). The second test exercises assignability into this union.

## Notes

- The string values (`'admin.product.created'`, etc.) are **not** safe to rename in isolation; external dashboards and alert rules read them literally. Update the test's expected object and the external tooling together.
- The second `it` block has no real runtime assertion. Its sole purpose is to make the TypeScript compiler verify the module augmentation. Don't "simplify" it away.
- Jest does **not** run `tsc`; a type-only regression (e.g., removing the `declare module` line) is caught by the CI `tsc` step, not by this test file at runtime.
