---
source: src/modules/invoicing/tests/unit/schema-contract.test.ts
sha256: b25e59c588ef587ee0abced507e56a8b65c9464ebceb95b8da0f42b2c9f59a14
generated_at: 2026-11-08T06:19:44.581308+00:00
model: ollama:qwen3.8:27b
---

# src/modules/invoicing/tests/unit/schema-contract.test.ts

## Purpose

Verifies the schema-level contract shared by the two frozen tax documents (invoice and credit note): both **require** the `orderNumber` and `currency` fields (copied from the originating order) and provide no fallback when either is absent.

## Key elements

- **`describe.each(['invoiceSchema', invoiceModel.schema], ['creditNoteSchema', creditNoteModel.schema'])`** — parameterises the single assertion across both models so a regression in either schema is caught.
- **`it('requires the order number and the currency copied from the order')`** — asserts that `requiredPaths(schema)` includes `'orderNumber'` and `'currency'` via `expect.arrayContaining`.

## Relationships

- **`src/modules/invoicing/model.ts`** — source of `invoiceModel` and `creditNoteModel`; their `.schema` objects are the subjects under test.
- **`tests/support/schema.ts`** — provides the `requiredPaths` helper that extracts the set of required field paths from a schema definition.

## Notes

- The test checks **presence in the required set only**; it does not validate default values, types, or that the value is actually derived from the order at runtime.
- `expect.arrayContaining` means the schema may declare additional required fields without breaking this test—new required fields are safe to add.
- The module doc comment frames the intent ("neither has a fallback when one is missing"), but the assertion itself only proves the fields are required; absence of a fallback is a modelling convention, not something this test directly enforces.
