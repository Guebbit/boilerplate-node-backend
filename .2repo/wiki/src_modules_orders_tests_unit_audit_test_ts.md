# src/modules/orders/tests/unit/audit.test.ts

## Purpose

Pins the exact string values of the orders audit action constants (`order.created`, `order.updated`, `order.deleted`, `order.cancelled`) as a wire-contract guard. These strings are consumed by log queries, dashboards, and alert rules outside this repository; a rename of the constant is a safe refactor, but a changed string silently breaks external tooling while the build still passes.

## Key elements

- **`describe('the orders audit vocabulary')`** — the single test suite in the file.
- **`toEqual` assertion on `ordersAuditActions`** — asserts whole-object equality so a changed value *and* an added/removed key both fail the test, forcing the decision to be documented here.
- **Type-level check (`const action: AuditAction = …`)** — verifies that the `declare module` augmentation in `audit.ts` actually registers orders' actions into the app-wide `AuditAction` union. This is a compile-time assertion (enforced by `tsc`, not Jest).

## Relationships

- **`src/modules/orders/audit.ts`** — imports `ordersAuditActions`; that file is the SUT. Also carries the `declare module` augmentation that feeds the `AuditAction` union.
- **`src/infrastructure/observability/audit.ts`** — source of the `AuditAction` type imported here; defines the cross-module union that the second test exercises.
- **`tests/cross-cutting/audit-actions.test.ts`** (referenced in comments, not a direct import) — asserts the *shape* of every module's vocabulary (presence, cross-module uniqueness, dotted lower snake_case) but deliberately does not assert values. This file is the value-level owner.

## Notes

- The strings are **wire contracts**, not identifiers. The JSDoc at the top of the file is the authoritative explanation of why the values are frozen here; keep it in sync if the rationale changes.
- The second test only compiles under the full `tsconfig.json` tree. Jest itself does not type-check, so a missing augmentation will surface as a `tsc` error at call sites of `emitAuditEvent`, not as a red test — unless `tsconfig.json` is narrowed to exclude `src`.
- Deleting this directory also deletes the only assertion that the string values remain `order.*`; the cross-cutting shape test will not catch the regression.
