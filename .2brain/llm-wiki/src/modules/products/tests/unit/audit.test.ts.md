---
source: src/modules/products/tests/unit/audit.test.ts
sha256: 16dd069f810019fe24db8773a9b69a7802f118cd3080e2c1bd6bf3457209f772
generated_at: 2026-09-23T19:30:16.076720+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/tests/unit/audit.test.ts

## Purpose

Guarantees that the audit action strings exported by the products module remain byte-for-byte stable. These strings are a wire contract consumed by log queries and alerting rules outside this repository, so a rename or silent add/remove of an action key would break external tooling. The test asserts the entire object to catch both value drift and structural changes.

## Key elements

- **`describe('the products audit vocabulary')`** – Single test block scoped to the audit vocabulary.
- **`expect(productsAuditActions).toEqual({ … })`** – Whole-object equality assertion against three known keys (`ADMIN_PRODUCT_CREATED`, `ADMIN_PRODUCT_UPDATED`, `ADMIN_PRODUCT_DELETED`). Using `toEqual` rather than individual key checks ensures an added or removed key fails the test.

## Relationships

- **Imports `productsAuditActions` from `src/modules/products/audit.ts`** – The sole dependency. The test does not import any other module or utility.

## Notes

- The whole-object `toEqual` is deliberate: a bare `toBe` on individual values would miss a newly added or removed key. This is the mechanism that enforces the "pinned string by string" contract noted in the file header.
- The string values (e.g. `'admin.product.created'`) are not refactor-safe. Renaming a constant in `audit.ts` without updating the matching string value will fail this test, as intended.
- No mocks, fixtures, or async setup are used; the test runs synchronously against a pure data export.
