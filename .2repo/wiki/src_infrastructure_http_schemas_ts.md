# src/infrastructure/http/schemas.ts

## Purpose

Shared Zod schemas for the handful of scalar query parameters (`page`, `pageSize`, `hardDelete`) that multiple HTTP endpoints accept. They exist so that bounds, coercion, and defaults for these scalars are declared once in infrastructure rather than re-derived per controller, preventing divergent behaviour (e.g. one endpoint returning 422 for `?pageSize=500` while another silently clamped).

## Key elements

- **`hardDeleteSchema`** — `z.preprocess(blankToUndefined, z.boolean().default(false))`. Treats the param as a boolean *value*, not a presence check, so `?hardDelete=false` does not trigger a hard delete. Absent → `false` (soft delete).
- **`pageSchema`** — `z.preprocess(blankToUndefined, z.coerce.number().int().min(1).optional())`. Coerces the query-string text to an integer ≥ 1; stays optional so `normalizePagination` downstream remains the sole authority on defaults.
- **`pageSizeSchema`** — Same shape as `pageSchema` plus `.max(100)`.
- **`paginationSchema`** — `z.object({ page, pageSize })`; convenience wrapper for endpoints that validate nothing else.
- **`blankToUndefined`** (private) — Maps `''`, `undefined`, and `null` to `undefined` so that `.optional()` / `.default()` treat the param as absent rather than producing a spurious 422.
- **`PAGE_SIZE_MAX = 100`**, **`HARD_DELETE_DEFAULT = false`** — Hardcoded constants mirroring `openapi.yaml` shared components. Intentionally *not* imported from the orval-generated client (see Notes).

## Relationships

- **Consumed by every controller that accepts pagination or `hardDelete`** (e.g. `get-products.ts`, `get-feedback.ts`, `get-inventory-levels.ts`, `get-stock-movements.ts`, `get-users.ts`, `get-orders.ts`, `get-locale-entries.ts`, `get-observability-audit.ts`, `delete-controller.ts`). They spread or reference these schemas in their request-input `z.object` definitions.
- **`tests/cross-cutting/contract-scalars.test.ts`** — Asserts that the hardcoded `PAGE_SIZE_MAX` and `HARD_DELETE_DEFAULT` still match every operation orval generated from `openapi.yaml`. Changing the OpenAPI component without updating these constants fails the build.
- **`tests/unit/infrastructure/http/schemas.test.ts`** — Unit-tests the coercion, blank handling, and bounds of each exported schema in isolation.
- **`docs/theory/request-input.md`** — Documents the `readInput` decode-then-validate pipeline that these schemas sit in; the schemas are the validation half.

## Notes

- **Why constants are hardcoded, not imported.** Orval flattens a shared OpenAPI component into a separate constant *per operation* (e.g. `GetProductsPageSizeMax`, `GetFeedbackPageSizeMax`, …). Importing any one would embed a domain module's name in infrastructure and break when that module is removed. The cross-cutting test inverts the dependency: the OpenAPI contract is the source of truth, and the build fails if the local constants drift.
- **`hardDelete` is a toggle, not a one-way flag.** A `DELETE` stamps `deletedAt` if absent and clears it if present (i.e. a second DELETE restores). Every module's `remove` implements this; this file is where the semantics are documented.
- **`page`/`pageSize` are deliberately `.optional()` with no `.default()`.** `normalizePagination` in `@infrastructure/persistence/search` is the single authority on "page 1, ten per page." Defaulting here would introduce a second, always-overwritten set of numbers.
