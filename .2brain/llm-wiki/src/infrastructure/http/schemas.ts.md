---
source: src/infrastructure/http/schemas.ts
sha256: 0e1d9bc97686545fbf52adc9b901fae5405cf7ff4623c8aafccfde5bf54c15e1
generated_at: 2026-10-14T08:01:09.562647+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/http/schemas.ts

## Purpose

Defines shared Zod schemas for the handful of scalar HTTP inputs (pagination, soft/hard delete, optional booleans) that multiple endpoints accept. Centralizes bounds, coercion, and blank-value handling so every controller enforces the same contract rather than re-deriving (or disagreeing on) what a legal `pageSize` or `hardDelete` spelling is.

## Key elements

- **`PAGE_SIZE_MAX` (100), `PAGE_MAX` (10 000), `HARD_DELETE_DEFAULT` (false)** — internal constants owning the `openapi.yaml` bounds; not exported, not imported from any orval-generated per-operation constant.
- **`blankToUndefined`** — maps `''`, `null`, and `undefined` to `undefined` so `.optional()` / `.default()` treat a blank form field as absent rather than a spurious 422.
- **`trimmedInto(field)`** — wraps a generated Zod string schema with `z.string().trim().pipe(field)` so whitespace-only input reads as empty while all declared bounds are preserved.
- **`hardDeleteSchema`** — preprocessed boolean (`blankToUndefined` → `z.boolean().default(false)`). Reads the value, never the presence, to avoid the `'false'`-is-truthy trap.
- **`pageSchema`** — coerced integer, 1 – 10 000, optional. Absent stays absent; defaults are owned by `normalizePagination`.
- **`pageSizeSchema`** — coerced integer, 1 – 100, optional.
- **`paginationSchema`** — `z.strictObject({ page, pageSize })`; unknown keys → 422.
- **`optionalBooleanSchema`** — preprocessed via `parseFormBoolean(blankToUndefined(value))` → `z.boolean().optional()`. Undefaulted: absent means "leave alone" (PATCH) or "no filter" (search).

## Relationships

- **`src/infrastructure/http/request.ts`** — provides `parseFormBoolean`, imported here for `optionalBooleanSchema`.
- **`src/infrastructure/surfaces/create-delete-controller.ts`** — consumes `hardDeleteSchema` for the DELETE/restore surface.
- **Module controllers** (`feedback`, `inventory`, `locales`, `audit-logs`, `delivery`, `api-keys`, `example`) — consume `paginationSchema`, `pageSchema`, `pageSizeSchema`, and/or `optionalBooleanSchema` for query-parameter validation.
- **`src/modules/account/services/profile.ts` / `signup.ts`** — consume `trimmedInto` for text-field validation.
- **`src/modules/locales/model.ts`** — consumes `trimmedInto` / `optionalBooleanSchema` for locale entry fields.

## Notes

- Constants are declared here (not imported from orval output) to avoid coupling `infrastructure` to one domain's generated module; `tests/cross-cutting/contract-scalars.test.ts` keeps them in sync with the generated client.
- `paginationSchema` is **strict** — a filter key the endpoint doesn't declare is a 422, not silently ignored.
- `hardDeleteSchema` and `optionalBooleanSchema` both guard against the `'false'`-string-is-truthy trap; anything unrecognised fails validation (422) rather than being guessed.
- `pageSchema` is intentionally `.optional()` (no default) so `normalizePagination` in `@infrastructure/persistence/search` remains the single authority on pagination defaults.
