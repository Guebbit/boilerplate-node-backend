# src/infrastructure/http/schemas.ts

## Purpose

Shared Zod schemas for the handful of HTTP query-parameter scalars (`page`, `pageSize`, `hardDelete`) accepted by multiple endpoints. Declared once in infrastructure so controllers don't re-derive bounds and defaults per-module, keeping them aligned with `openapi.yaml` (via orval-generated constants) rather than drifting.

## Key elements

- **`PAGE_SIZE_MAX` (100), `PAGE_MAX` (10 000), `HARD_DELETE_DEFAULT` (false)** — Internal constants that mirror `openapi.yaml` shared components. Declared here (not imported from any orval per-operation constant) so infrastructure doesn't couple to a specific domain module's generated client.
- **`blankToUndefined`** — Internal helper that maps `''`, `null`, and `undefined` to `undefined`, so `.optional()` / `.default()` treat empty form-submitted values as absent instead of producing spurious 422s.
- **`hardDeleteSchema`** — `z.preprocess(blankToUndefined, z.boolean().default(false))`. Reads the param as a boolean *value*; absent defaults to `false` (soft delete). Unrecognized strings fail with 422.
- **`pageSchema`** — `z.preprocess(blankToUndefined, z.coerce.number().int().min(1).max(PAGE_MAX).optional())`. Coerces string→integer; absent stays absent (defaults are owned by `normalizePagination` in `@infrastructure/persistence/search`).
- **`pageSizeSchema`** — Same shape as `pageSchema` but bounded to 1–100.
- **`paginationSchema`** — `z.object({ page, pageSize })` convenience pair for endpoints that validate nothing else.

## Relationships

- **Consumed by** all listed controllers (`create-delete-controller`, `get-feedback`, `get-inventory-levels`, `get-stock-movements`, `get-locale-entries`, `get-observability-audit`, `get-orders`, `get-products`, `get-users`), which import the exported schemas to validate their query parameters via `readInput`.
- **`tests/cross-cutting/contract-scalars.test.ts`** asserts that `PAGE_SIZE_MAX`, `PAGE_MAX`, and `HARD_DELETE_DEFAULT` still match the values orval generated from `openapi.yaml`, catching drift when the spec changes.
- **`tests/unit/infrastructure/http/schemas.test.ts`** exercises the coercion, blank-handling, and boundary behavior of each exported schema.

## Notes

- **`hardDelete` is a toggle, not a flag.** `??request.query.hardDelete` (presence check) would make `?hardDelete=false` truthy and delete. Always go through `hardDeleteSchema` so the string `'false'` is decoded to `false`.
- **Defaults live in one place per concern.** `page`/`pageSize` intentionally stay `.optional()` here; `normalizePagination` (`@infrastructure/persistence/search`) is the single authority on pagination defaults. `hardDelete` *is* defaulted here (to `false`) because it has no analogous downstream normalizer.
- **Bounds are contract, not policy.** `PAGE_SIZE_MAX` and `PAGE_MAX` exist because `openapi.yaml` declares those maxima. Changing them without updating the spec violates the declared contract.
- **Why not import from orval?** Orval flattens one shared `openapi.yaml` component into ~40 per-operation constants. Importing any one would embed a domain module's name in infrastructure, breaking if that module's contract fragment is removed. The cross-cutting test is the safety net that keeps this file in sync.
