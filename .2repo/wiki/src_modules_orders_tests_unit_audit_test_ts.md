# src/modules/orders/tests/unit/audit.test.ts

## Purpose

Unit test that pins the orders module's audit action strings to their exact wire-contract values and verifies they are registered in the app-wide `AuditAction` type union. It exists because these strings are read by log queries and alert rules outside this repo — a silent rename or omission breaks downstream tooling.

## Key elements

- **`describe('the orders audit vocabulary')`** — the single test suite in the file.
- **`it('spells every action exactly as the log tooling expects')`** — asserts `ordersAuditActions` via whole-object `toEqual` against four literal strings (`order.created`, `order.updated`, `order.deleted`, `order.cancelled`). Whole-object equality catches a changed value *and* an action added or removed without documentation.
- **`it('registers its actions in the app-wide union')`** — assigns `ordersAuditActions.ORDER_CREATED` to a variable typed as `AuditAction`, exercising the `declare module` augmentation at compile time.

## Relationships

- **`src/modules/orders/audit.ts`** — the SUT. Exports `ordersAuditActions` and contains the `declare module` augmentation that merges these four strings into `AuditAction`.
- **`src/infrastructure/observability/audit.ts`** — defines the base `AuditAction` type (and the `emitAuditEvent` API) that the orders module augments.

## Notes

- The second test's type-level assertion is verified by `tsc` (the whole tree is in `tsconfig.json`), **not** by Jest at runtime. If the `declare module` augmentation is removed, Jest still passes but type-checking fails — CI must run the type-checker to catch this.
- String values are a wire contract, not internal identifiers. Renaming them requires a coordinated change in downstream log/alert infrastructure.
- The file uses `toEqual` (deep equality on the object) rather than per-key checks, deliberately catching accidental key additions or removals.
