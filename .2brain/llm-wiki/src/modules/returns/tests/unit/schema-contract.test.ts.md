---
source: src/modules/returns/tests/unit/schema-contract.test.ts
sha256: 984a7abfcb675e401d59b0dabfbfbce3c64f88e57d3575411cb21efa1b945c1a
generated_at: 2026-10-15T12:02:15.310650+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/tests/unit/schema-contract.test.ts

## Purpose

Unit test that pins down the public contract of `returnSchema` — which fields are required, which enums are closed, what defaults apply, what references exist, and which indexes are declared. It also asserts the deliberate *absence* of a `userId` field, encoding the design decision that a return is owned solely by its order (supporting GDPR Art. 17(3)(b)/(e) account-erasure without touching return records).

## Key elements

- **`describe('returnSchema', …)`** — single top-level block; no exported helpers, just Jest assertions.
- **Required-fields test** — asserts `requiredPaths` equals `['currency','kind','lines','orderId','orderNumber','reason','returnPostage']`.
- **No-person link test** — asserts `returnSchema.path('userId')` is `undefined`.
- **ObjectId reference test** — asserts `orderId` is typed `ObjectId` and references the `Order` model.
- **Defaults & enums test** — asserts `status` defaults to `'requested'` and lists its five allowed values; `reason` has five values; `returnPostage` has two; `kind` defaults to `'return'` with `['return','cancellation']`.
- **Index test** — asserts `indexOptionSpecs` includes `returns_orderId_createdAt` and `returns_status_createdAt`.

## Relationships

- **`src/modules/returns/model.ts`** — the source of the `returnSchema` object under test; every assertion here validates its shape.
- **`tests/support/schema.ts`** — supplies the introspection helpers (`enumOf`, `indexOptionSpecs`, `refOf`, `requiredPaths`, `typeOf`, `defaultOf`) that let the test read Mongoose schema metadata without instantiating documents.

## Notes

- The test is a *contract* test: it checks schema-level metadata (paths, types, enums, defaults, indexes) rather than runtime behavior or validation logic. A change to any of those in `model.ts` will break this file.
- The absence-of-`userId` assertion is intentional and load-bearing for the GDPR compliance story documented in the module header; removing it silently would change the erasure guarantee.
- Index assertions use `toContain` on a space-joined string, so ordering of indexes in the model does not matter, but a rename or removal of either compound index will fail the test.
