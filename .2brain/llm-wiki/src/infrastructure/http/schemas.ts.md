---
source: src/infrastructure/http/schemas.ts
sha256: 41200744346c4a3688a982b812daf8a9c32d0b98963304e07169727ec17ea42c
generated_at: 2026-11-14T18:06:44.842384+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/http/schemas.ts

## Purpose

Reusable Zod schemas for the small set of scalar HTTP inputs (pagination, booleans, locale tags) that multiple endpoints share. Exists so that constants and validation rules are declared once in infrastructure rather than re-derived per controller, preventing drift between endpoints (e.g. two endpoints disagreeing on a legal page size) and keeping the numbers anchored to `openapi.yaml` shared components that orval flattens into per-operation constants.

## Key elements

- **`PAGE_SIZE_MAX` (100), `PAGE_MAX` (10 000), `HARD_DELETE_DEFAULT` (false)** — Infrastructure-owned constants for the `pageSize`, `page`, and `hardDelete` OpenAPI shared components. Verified against orval output by `tests/cross-cutting/contract-scalars.test.ts`.
- **`blankToUndefined`** — Preprocess helper that maps `''`, `null`, and `undefined` to `undefined` so `.optional()`/`.default()` treat blank form values as absent rather than spurious 422s.
- **`trimmedInto(field)`** — Wraps a generated string schema with `z.string().trim().pipe(field)`, making whitespace-only values read as empty while preserving all declared bounds.
- **`wellFormedLocale(field)`** — Refines a locale field to require BCP 47 well-formedness (e.g. rejects `en-a`). Works on optional, nullable, or bare string fields.
- **`hardDeleteSchema`** — `z.preprocess(blankToUndefined, z.boolean().default(false))`. Reads the value, never presence; unrecognised spellings 422.
- **`pageSchema`** — Coerce → int → min 1 → max `PAGE_MAX` → optional. No default here; `normalizePagination` owns defaults.
- **`pageSizeSchema`** — Coerce → int → min 1 → max `PAGE_SIZE_MAX` → optional.
- **`paginationSchema`** — `z.strictObject({ page, pageSize })`; unknown keys are 422, not silently ignored.
- **`optionalBooleanSchema`** — Preprocesses through `parseFormBoolean` + `blankToUndefined`, then `z.boolean().optional()`. Undefaulted: absent means "leave alone" or "no filter".

## Relationships

- **`src/infrastructure/http/request.ts`** — Provides `parseFormBoolean`, imported and used by `hardDeleteSchema` and `optionalBooleanSchema` to decode form/multipart string spellings into real booleans.
- **`src/infrastructure/i18n/index.ts`** — Provides `isWellFormedLocale`, imported and used inside `wellFormedLocale`.
- **`src/infrastructure/i18n/locale-tag.ts`** — Underlying implementation of the locale well-formedness check (re-exported through the i18n index).
- **Controllers** (`get-examples`, `post-example`, `update-example`, `get-api-keys`, `get-audit`, `get-date-impact`, `get-preorder-fulfillment-orders`, `get-inventory-levels`, `update-account`, `signup`, `create-delete-controller`, `title-rule`) — Consume the exported schemas (`paginationSchema`, `hardDeleteSchema`, `optionalBooleanSchema`, `trimmedInto`, `wellFormedLocale`, `blankToUndefined`) in their `readInput` validation pipelines.

## Notes

- Constants are declared here, **not** imported from orval per-operation constants, to avoid coupling infrastructure to a domain module that may be deleted. The cross-cutting test keeps them in sync.
- `pageSchema` / `pageSizeSchema` are `.optional()` with **no** `.default()` — defaulting is the sole responsibility of `normalizePagination` in `@infrastructure/persistence/search`. Adding a default here would be dead code.
- `paginationSchema` is `strictObject`; a controller that spreads an unknown filter key into it will get a 422, not a silent no-op.
- `optionalBooleanSchema` deliberately has no default: in PATCH semantics absent means "do not touch the field", and in search semantics it means "no filter".
- `hardDeleteSchema` uses `.default(HARD_DELETE_DEFAULT)` (soft delete), whereas `optionalBooleanSchema` does not — the former is a request parameter with a contract-level default, the latter is a PATCH-semantic flag.
