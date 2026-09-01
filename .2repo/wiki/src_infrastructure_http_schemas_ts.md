# src/infrastructure/http/schemas.ts

## Purpose

Defines shared Zod schemas for the small set of scalar HTTP inputs (`page`, `pageSize`, `hardDelete`) accepted by multiple endpoints. It exists so these scalars are validated once in infrastructure rather than re-derived per controller, preventing the kind of disagreement that once made `GET /products` and `GET /feedback` disagree on a legal page size. Bounds and defaults track `openapi.yaml` via orval-generated constants, with cross-cutting tests guarding drift.

## Key elements

- **`PAGE_SIZE_MAX`** (const, `100`) — upper bound for `pageSize`; declared locally to avoid importing from a single orval-generated per-operation constant that would couple infrastructure to one domain.
- **`HARD_DELETE_DEFAULT`** (const, `false`) — default for the soft/hard delete switch when the caller omits the field.
- **`blankToUndefined`** (function) — preprocess helper that maps `''`, `null`, and `undefined` to `undefined`, so `.optional()` / `.default()` treat them as "absent" rather than an invalid value (prevents spurious 422s from untouched form fields).
- **`hardDeleteSchema`** (export) — `z.preprocess(blankToUndefined, z.boolean().default(false))`; reads the value as a boolean, never as presence.
- **`pageSchema`** (export) — coerces to integer ≥ 1; stays `optional` (no default applied here).
- **`pageSizeSchema`** (export) — coerces to integer, bounds to `1..100`; stays `optional`.
- **`paginationSchema`** (export) — `z.object({ page, pageSize })` convenience pair for endpoints that validate nothing else.

## Relationships

- **Consumed by controllers** — `create-delete-controller`, `get-feedback`, `get-inventory-levels`, `get-stock-movements`, `get-locale-entries`, `get-observability-audit`, `get-orders`, `get-products`, and `get-users` import these schemas to validate their respective query/body scalars before business logic runs.
- **`tests/cross-cutting/contract-scalars.test.ts`** — asserts `PAGE_SIZE_MAX` (and `HARD_DELETE_DEFAULT`) still match the values orval generates from `openapi.yaml`, catching drift if the generated constants change.
- **`tests/unit/infrastructure/http/schemas.test.ts`** — unit-tests the schemas' coercion, bounds, defaults, and blank-value handling.
- **`@infrastructure/persistence/search`** (`normalizePagination`) — the single authority on pagination *defaults*; the schemas here deliberately leave `page`/`pageSize` as `undefined` so that function can apply them.

## Notes

- **Value vs. presence for `hardDelete`**: `?hardDelete=false` is a *value* (soft delete), not an absence. The `!!request.query.hardDelete` pattern would treat the string `"false"` as truthy and permanently delete — the schema avoids this by reading through `z.boolean()`.
- **No defaults in the schemas**: `pageSchema` and `pageSizeSchema` are `.optional()` with no `.default()`. Defaulting here would be silently overwritten by `normalizePagination` and create a second source of truth.
- **Local constants, not imports**: `PAGE_SIZE_MAX` and `HARD_DELETE_DEFAULT` are *declared* in this file rather than imported from the orval client. This keeps infrastructure decoupled from any single domain's generated fragment; the contract-scalar test enforces agreement.
- **`blankToUndefined` uses `== null`** (loose) to catch both `undefined` and an explicit JSON `null` in the same guard.
