---
source: src/modules/products/probes.ts
sha256: b55751c7a734446e62a3126fb2a46547dcf2bf823cda9eb93cece736ea267093
generated_at: 2026-10-29T05:27:43.590319+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/probes.ts

## Purpose

Defines hand-written API probes for the products module that exercise behaviors the OpenAPI contract cannot express—validation error shape, language negotiation, optional filter combinations, and visibility rules around soft-deleted, inactive, and off-sale states. It complements the auto-generated request collections; `scripts/contracts/client-collections-bundle.ts` owns the emission pipeline and the full `{{seedToken}}` vocabulary.

## Key elements

- **`probes: Probe[]`** — the sole export. An array of six `Probe` objects (type imported from `@guebbit/openapi-runnable-collections`). Each entry carries `name`, `why`, `method`, `path`, and optionally `auth`, `body`, or `headers`.
  - POST `/products` with a schema-violating body → expects 422 with `errors[]` entries.
  - GET `/products/{{seedProductId}}` with `Accept-Language: it` → exercises un-declared language negotiation.
  - GET `/products` with all optional filters (`page`, `pageSize`, `priceMin`, `priceMax`, `active`) simultaneously.
  - GET `/products/{{seedSoftDeletedProductId}}` → anonymous should get 404; admin should get the record.
  - GET `/products/{{seedInactiveProductId}}` → inactive (404 anonymous) vs. off-sale (visible) distinction.
  - GET `/products/{{seedOffSaleProductId}}` → `purchasable: false` is visible, contrasting with `active: false`.

## Relationships

- Imports the `Probe` type from `@guebbit/openapi-runnable-collections` (type-only import; no runtime dependency).
- The module doc header designates `scripts/contracts/client-collections-bundle.ts` as the authority on probe semantics, emission location, and valid seed-token values. No other graph neighbors.

## Notes

- This file is a pure data export—no logic, no side effects, no runtime imports.
- `{{seedToken}}` placeholders in paths are resolved externally by the collections bundle; do not treat them as literal path segments.
- Several probes are meant to be run *in pairs* (inactive vs. off-sale; soft-deleted with and without admin auth). The `why` field on each probe documents the intended comparison, but the pairing is a consumer concern, not encoded in the data.
