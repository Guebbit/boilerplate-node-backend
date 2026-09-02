# src/modules/products/tests/unit/audit.test.ts

## Purpose

Locks in the exact string values of the `productsAuditActions` vocabulary so that accidental renames, additions, or removals are caught immediately. The values are a wire contract consumed by external log queries and alerting tooling, not just internal constants.

## Key elements

- **`describe('the products audit vocabulary')`** — single test suite scoped to the audit vocabulary.
- **`expect(productsAuditActions).toEqual({...})`** — asserts the entire object by deep equality against three pinned entries (`ADMIN_PRODUCT_CREATED`, `ADMIN_PRODUCT_UPDATED`, `ADMIN_PRODUCT_DELETED`). Using `toEqual` (not `toMatchObject`) means both unexpected extra keys and missing keys fail the test.

## Relationships

- **`src/modules/products/audit.ts`** — the sole import source; exports `productsAuditActions`, the object whose shape and values are asserted here.

## Notes

- The test intentionally compares the *string values* (`'admin.product.created'`, etc.) rather than just the keys. The doc comment makes clear these strings are read by log-query tooling outside this repo, so a constant rename that leaves the value unchanged is safe, but changing the value would silently break external dashboards/alerts.
- Adding a new audit action to `audit.ts` without adding it here will fail this test — it acts as a written-down registry.
- Only one test case; there is no parametric or per-action breakdown by design (the whole-object assertion is the point).
