---
source: src/modules/invoicing/tests/unit/schema-contract.test.ts
sha256: b25e59c588ef587ee0abced507e56a8b65c9464ebceb95b8da0f42b2c9f59a14
generated_at: 2026-10-15T10:41:13.339627+00:00
model: ollama:qwen3.8:27b
---

# src/modules/invoicing/tests/unit/schema-contract.test.ts

## Purpose

Verifies the frozen tax-document schema contract: both the invoice and credit-note schemas must declare `orderNumber` and `currency` as required fields (copied from the parent order, with no fallback). The file exists to lock in this invariant so a future schema change that drops or makes optional either field fails CI immediately.

## Key elements

- **`describe.each` block** – Parametrizes the suite over `invoiceModel.schema` and `creditNoteModel.schema`, running the same assertion against both.
- **Single `it` ("requires the order number and the currency copied from the order")** – Calls `requiredPaths(schema)` and asserts the result is an array containing `'orderNumber'` and `'currency'`.

## Relationships

- **`src/modules/invoicing/model.ts`** – Source of `invoiceModel` and `creditNoteModel`; their `.schema` properties are the objects under test.
- **`tests/support/schema.ts`** – Provides the `requiredPaths` helper, which extracts the set of required field paths from a schema object.

## Notes

- The assertion uses `expect.arrayContaining`, so the schemas are permitted to have additional required fields; the test only guarantees these two are present.
- The module docblock states "neither has a fallback when one is missing," but the test only checks required-ness via `requiredPaths`. It does **not** assert the absence of a `default`/`fallback` value on those fields—that guarantee rests on schema-authoring conventions, not this test.
- Both documents are tested identically (same assertion), reflecting the design intent that invoice and credit note share the same copy-from-order contract.
