---
source: src/infrastructure/http/schemas.ts
sha256: aab55e551313f8eb45e41dc01ffc2db1a29b4fe6c2acfdcbd804aa5d0698020a
generated_at: 2026-11-08T03:34:49.035704+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/http/schemas.ts

## Purpose

Reusable Zod schemas for the small set of scalar values (pagination, `hardDelete`, booleans) that more than one HTTP endpoint accepts. `readInput` decodes transport types but deliberately skips validation; this file fills that gap once so controllers don't each re-derive bounds and defaults independently. Numeric bounds mirror `openapi.yaml` via locally declared constants rather than importing any single orval-generated per-operation constant.

## Key elements

- **`PAGE_SIZE_MAX` / `PAGE_MAX`** (100 / 10 000) — Upper bounds for `pageSize` and `page`, declared here to avoid coupling infrastructure to one domain's generated constant.
- **`HARD_DELETE_DEFAULT`** (`false`) — Default for the `hardDelete` flag when the caller sends nothing.
- **`blankToUndefined(value)`** — Maps `''`, `null`, and `undefined` to `undefined` so `.optional()` / `.default()` treat them as absent instead of producing a spurious 422.
- **`trimmedInto(field)`** — Wraps a generated Zod string field with `z.string().trim().pipe(field)`, making whitespace-only input read as empty without restating the field's own bounds.
- **`hardDeleteSchema`** — `z.preprocess(blankToUndefined, z.boolean().default(false))`. Reads the value (not presence) so `?hardDelete=false` never hard-deletes.
- **`pageSchema` / `pageSizeSchema`** — Coerce string → integer, enforce min 1 and the respective max; optional (absent stays absent; `normalizePagination` owns defaults).
- **`paginationSchema`** — `z.strictObject({ page, pageSize })`; unknown keys yield 422.
- **`optionalBooleanSchema`** — Decodes form/JSON boolean spellings via `parseFormBoolean` + `blankToUndefined`, then validates against `z.boolean().optional()`. No default: absence means "don't change" or "no filter."

## Relationships

- **Imports** `parseFormBoolean` from `src/infrastructure/http/request.ts` (used by `optionalBooleanSchema`).
- **Consumed by** a broad set of controllers and services across modules (`example`, `inventory`, `locales`, `delivery`, `account`, `api-keys`, `audit-logs`, and `create-delete-controller`), which import the exported schemas to validate their query/body scalars.
- **Cross-checked by** `tests/cross-cutting/contract-scalars.test.ts`, which asserts the local constants still match the values orval generates from `openapi.yaml`.

## Notes

- Bounds are **intentionally not imported** from any orval-generated constant. Orval flattens one shared `openapi.yaml` component into ~40 per-operation constants; importing one would embed a domain name in infrastructure and break when that module's fragment is removed.
- `blankToUndefined` uses `== undefined` (loose) on purpose to catch both `null` and `undefined` from JSON bodies, plus `''` from form/query fields.
- `hardDeleteSchema` and `optionalBooleanSchema` both guard against the JS trap where the string `'false'` is truthy — they parse the *value*, not the *presence* of the key.
- `paginationSchema` is a **strict** object: a query parameter the endpoint doesn't recognise returns 422 rather than being silently ignored.
