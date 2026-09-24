---
source: src/modules/products/probes.ts
sha256: 3eae6c59f3c6079da72782dcf139507eb9593c4336c9ef906e4a591515245d34
generated_at: 2026-09-23T19:27:47.024484+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/probes.ts

## Purpose

Holds hand-written API requests for the products module that a generated contract cannot express — validation-failure payloads, headers the generator omits, optional-parameter combinations, and visibility-rule edge cases. It complements the generated collection owned by `scripts/contracts/client-collections-bundle.ts`.

## Key elements

- **`probes: Probe[]`** (default-style export) — an array of five `Probe` objects (type from `@guebbit/openapi-runnable-collections`). Each entry carries `name`, `why` (human-readable rationale), `method`, `path`, and optionally `auth`, `body`, or `headers`.
  - *422 on invalid body* — POST `/products` with an empty `title` and `price: -1` to confirm the validation envelope fires.
  - *Italian `Accept-Language`* — GET a single product with `Accept-Language: it` to observe i18n on error/status messages.
  - *All optional filters combined* — GET `/products` with `page`, `pageSize`, `minPrice`, `maxPrice`, `active` simultaneously.
  - *Soft-deleted, anonymous* — GET `/products/{{seedSoftDeletedProductId}}` without auth; expects 404.
  - *Inactive, anonymous* — GET `/products/{{seedInactiveProductId}}` without auth; exercises the `active: false` vs. `deletedAt` distinction.

## Relationships

- **`scripts/contracts/client-collections-bundle.ts`** — owns the surrounding collection: the definition of what a probe is for, the emission target, and the canonical set of `{{seedToken}}` values (`{{seedProductId}}`, `{{seedSoftDeletedProductId}}`, `{{seedInactiveProductId}}`) that this file references. Changes to token names in the bundle file will break the paths here.

## Notes

- Paths use `{{…}}` seed tokens, not concrete IDs. The valid token vocabulary lives in the bundle script, not here.
- The `why` field on each probe is intentionally prose (back-tick Markdown) meant to be surfaced in the runner UI, not parsed programmatically.
- Probes are ordered by the narrative arc (validation → i18n → filters → visibility pair); the last two are designed to be run back-to-back with differing auth to contrast results.
- No dynamic logic: the array is a static literal. Adding a probe means appending an object; there is no factory or builder.
