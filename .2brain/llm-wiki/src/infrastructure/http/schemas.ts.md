---
source: src/infrastructure/http/schemas.ts
sha256: b7f29d0a5357b4f5c7c54d9d15acd2d20c9751d55bee0088d7ed53489448948c
generated_at: 2026-09-23T17:46:06.391479+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/http/schemas.ts

## Purpose

Shared Zod schemas for the scalar HTTP query/body parameters (`page`, `pageSize`, `hardDelete`, `weight`, arbitrary booleans) that more than one endpoint accepts. Centralising them here prevents per-controller drift (e.g. `GET /products` and `GET /feedback` once disagreed on legal page size) and keeps the bounds in lockstep with `openapi.yaml` without importing from any single orval-generated operation constant.

## Key elements

- **`PAGE_SIZE_MAX` (100), `PAGE_MAX` (10 000), `HARD_DELETE_DEFAULT` (false)** — module-private constants mirroring the `openapi.yaml` shared components. Deliberately *not* imported from orval output to avoid coupling infrastructure to a specific domain's generated file. Verified against orval by `tests/cross-cutting/contract-scalars.test.ts`.
- **`blankToUndefined`** — preprocessor that maps `''` and `null`/`undefined` to `undefined` so `.optional()` / `.default()` treat an untouched form field as absent rather than as a spurious value.
- **`hardDeleteSchema`** — `z.preprocess(blankToUndefined, z.boolean().default(false))`. Decodes the string spellings (`"true"`/`"false"`) via `parseFormBoolean`; anything unrecognised yields a 422. Defaults to soft-delete when absent.
- **`pageSchema`** — coerced integer, `min 1`, `max PAGE_MAX`, optional. No default here; `normalizePagination` in `@infrastructure/persistence/search` owns defaults.
- **`pageSizeSchema`** — coerced integer, `min 1`, `max PAGE_SIZE_MAX`, optional.
- **`paginationSchema`** — `z.object({ page, pageSize })` for endpoints that validate nothing else.
- **`weightSchema`** — coerced integer, `min 0`, optional. Blank-to-undefined prevents `Number('')` silently producing `0`.
- **`optionalBooleanSchema`** — pipes through `parseFormBoolean(blankToUndefined(value))` then `z.boolean().optional()`. Handles the `'false'`-is-truthy trap. No default: absence means "leave alone" (PATCH) or "no filter" (search).

## Relationships

- **`src/infrastructure/http/request.ts`** — provides `parseFormBoolean`, used inside `optionalBooleanSchema` to decode recognised string spellings of booleans from query strings / multipart bodies.
- **`src/infrastructure/surfaces/create-delete-controller.ts`** — consumes `hardDeleteSchema` for its `DELETE` toggle (absent → soft-delete / restore, present → hard-delete).
- **`src/modules/account/services/authentication.ts`**, **`profile.ts`** — import `optionalBooleanSchema` (or related scalars) for boolean query params.
- **All listed `get-*` controllers** (`get-products`, `get-feedback`, `get-orders`, `get-users`, `get-inventory-levels`, `get-stock-movements`, `get-locale-entries`, `get-observability-audit`, `get-audit`, `get-shipping-methods`) — import `pageSchema`, `pageSizeSchema`, and/or `paginationSchema` for their pagination query parameters.
- **`src/modules/api-keys/controllers/list-api-keys.ts`** — consumes the pagination schemas for its list endpoint.

## Notes

- Every schema uses `z.preprocess(blankToUndefined, …)` as its first step. If you add a new scalar schema, apply the same pattern so untouched form fields (`?field=`) don't produce a 422 or a silent `0`.
- Bounds are **intentionally duplicated** here rather than imported from orval. Changing `openapi.yaml` requires updating both this file and the generated client; the cross-cutting test (`contract-scalars.test.ts`) catches the drift.
- `pageSchema` / `pageSizeSchema` are `.optional()` with **no** `.default()`. Defaulting belongs exclusively to `normalizePagination` in the persistence layer; adding a default here would be silently overwritten and would confuse readers.
- `hardDeleteSchema` reads the value, never the key's presence. `!!request.query.hardDelete` is explicitly called out as a bug (the string `'false'` is truthy).
