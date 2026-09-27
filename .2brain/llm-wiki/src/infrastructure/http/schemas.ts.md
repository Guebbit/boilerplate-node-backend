---
source: src/infrastructure/http/schemas.ts
sha256: 1c769ba338b1d2ff0b7f95fb7c1ad881f6cc7912e555ea239c5dc5c274b81bd4
generated_at: 2026-09-27T14:11:10.359837+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/http/schemas.ts

## Purpose

Shared Zod validation schemas for scalar HTTP query parameters (pagination, booleans) that multiple endpoints accept. Exists to centralise bounds and coercion so that no two controllers silently disagree on what a legal `pageSize` or `hardDelete` value is, and to keep the numbers aligned with the single shared components in `openapi.yaml` without importing from any one generated per-operation constant.

## Key elements

- **`PAGE_SIZE_MAX` (100), `PAGE_MAX` (10 000), `HARD_DELETE_DEFAULT` (false)** — Infrastructure-owned constants for the shared `openapi.yaml` components `PageSize`, `Page`, and `hardDelete`. Avoids importing from a domain's orval-generated constant (which would couple infrastructure to a module that could be deleted).
- **`blankToUndefined`** — Maps `''`, `null`, and `undefined` to `undefined` so `.optional()`/`.default()` treat untouched form fields as absent rather than producing a spurious 422.
- **`hardDeleteSchema`** — `z.preprocess(blankToUndefined, z.boolean().default(false))`. Reads the value, not presence; rejects unrecognised spellings with 422.
- **`pageSchema`** — Coerces string→number, requires integer ≥ 1 ≤ `PAGE_MAX`, stays optional (defaults are `normalizePagination`'s job).
- **`pageSizeSchema`** — Same coercion, bounded to `PAGE_SIZE_MAX`, optional.
- **`paginationSchema`** — `z.object({ page, pageSize })` convenience for endpoints that validate nothing else.
- **`optionalBooleanSchema`** — Decodes text spellings via `parseFormBoolean`, passes recognised booleans to `z.boolean().optional()`. Undefaulted: absence means "no filter" or "leave field alone" (PATCH).

## Relationships

- **`src/infrastructure/http/request.ts`** — Provides `parseFormBoolean`, used by `optionalBooleanSchema` to decode string boolean spellings from query strings and multipart bodies.
- **Controllers** (e.g. `get-products`, `get-feedback`, `get-orders`, `get-users`, `list-api-keys`, `get-audit`, `get-inventory-levels`, `get-stock-movements`, `get-locale-entries`, `get-observability-audit`, `list-deliveries`, `create-delete-controller`, `authentication`, `profile`) — Import the exported schemas to validate their query-string and body scalar inputs before calling services.

## Notes

- Bounds here mirror `openapi.yaml`; `tests/cross-cutting/contract-scalars.test.ts` asserts they stay in sync with the orval-generated constants. Do not change one without the other.
- `pageSchema` is deliberately `.optional()` with no `.default()` — defaulting is owned by `normalizePagination` in `@infrastructure/persistence/search`. Adding a default here would be dead code that always gets overwritten.
- `hardDeleteSchema` uses value semantics, not presence: `?hardDelete=false` is valid and means "soft delete". `!!query.hardDelete` would incorrectly treat the string `'false'` as truthy.
- `blankToUndefined` uses `== null` (not `=== null`) to also catch explicit `null` from JSON bodies, while `=== ''` catches the empty-string a form submits for an untouched field.
