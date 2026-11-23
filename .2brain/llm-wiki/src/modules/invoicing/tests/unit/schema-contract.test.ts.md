---
source: src/modules/invoicing/tests/unit/schema-contract.test.ts
source_sha256: b25e59c588ef587ee0abced507e56a8b65c9464ebceb95b8da0f42b2c9f59a14
context_sha256: 6815558fb17cc2a26a692ece7c21b222346e39a9809668bc4f9a4705beb9682f
generated_at: 2026-11-22T05:41:09.149767+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/invoicing/tests/unit/schema-contract.test.ts

## Purpose
A unit test that pins the schema contract of the frozen tax documents. Both the invoice and the credit note copy the order's own `orderNumber` and `currency`, and neither has a fallback if one is missing, so both fields must be required on each schema.

## Key elements
- `describe.each` over two cases: `invoiceSchema` (`invoiceModel.schema`) and `creditNoteSchema` (`creditNoteModel.schema`). The suite title is `'%s — what a frozen tax document must carry'`.
- One test per schema: `requires the order number and the currency copied from the order`. It asserts that `requiredPaths(schema)` contains `orderNumber` and `currency`, using `toEqual(expect.arrayContaining([...]))`.

## Relationships
- `src/modules/invoicing/model.ts`: provides `invoiceModel` and `creditNoteModel`, imported via the `@modules/invoicing/model` alias. Their `.schema` objects are the subjects under test.
- `tests/support/schema.ts`: provides the `requiredPaths` helper, imported via the `@tests/schema` alias. It extracts the required paths from a schema.

## Notes
- `arrayContaining` makes the check a subset match. Other required paths are allowed, and the test fails only if `orderNumber` or `currency` is missing from either schema.
- The `describe.each` callback names its first parameter `_name`, which is unused. The name only feeds the `%s` title formatting.
