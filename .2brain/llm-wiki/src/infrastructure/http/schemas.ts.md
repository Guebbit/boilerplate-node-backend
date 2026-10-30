---
source: src/infrastructure/http/schemas.ts
sha256: 28b19b52d09a61dfecda10cd35c81042826f6131c9d4988a38c08a410e4af152
generated_at: 2026-10-29T02:05:43.502412+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/http/schemas.ts

## Purpose

Shared Zod schemas for the small set of scalar parameters (pagination, delete mode, booleans) that appear across many HTTP endpoints. They centralise coercion, bounds, and blank-value handling so controllers don't re-derive the same rules independently, and they keep those bounds in lockstep with `openapi.yaml` rather than drifting.

## Key elements

- **`PAGE_SIZE_MAX` (100) / `PAGE_MAX` (10 000) / `HARD_DELETE_DEFAULT` (false)** — internal constants sourced from the OpenAPI spec; declared here instead of importing a single orval-generated per-operation constant to avoid coupling infrastructure to one domain's generated client.
- **`blankToUndefined`** — maps `''`, `null`, and `undefined` to `undefined` so downstream `.optional()` / `.default()` treat them as "not specified" rather than emitting a spurious 422.
- **`trimmedInto(field)`** — wraps a generated Zod string field with `z.string().trim().pipe(field)` so whitespace-only input is rejected by the field's own `minLength` rule.
- **`hardDeleteSchema`** — `z.preprocess(blankToUndefined, z.boolean().default(false))`; reads the *value* (not presence) to avoid the `'false'`-is-truthy trap.
- **`pageSchema` / `pageSizeSchema`** — `z.coerce.number().int().min(1).max(…)` wrapped in `.optional()`; coercion handles query-string text, bounds mirror the OpenAPI `maximum`.
- **`paginationSchema`** — `z.strictObject({ page, pageSize })`; strict so unknown filter keys produce a 422 rather than a silent no-op.
- **`optionalBooleanSchema`** — decodes form/JSON spellings via `parseFormBoolean`, then validates against `z.boolean().optional()`; deliberately undefaulted (absence means "leave alone" or "no filter").

## Relationships

- **`src/infrastructure/http/request.ts`** — source of `parseFormBoolean`, used by `optionalBooleanSchema` to decode string spellings from query-string and multipart bodies.
- **Controllers** (`create-delete-controller`, `list-api-keys`, `get-audit`, `get-date-impact`, `get-preorder-fulfillment-orders`, `get-examples`, `post-example`, `update-example`, `get-inventory-levels`, `get-preorder-levels`, `get-stock-movements`, `get-locale-entries`, `write-locale-entries`) — import one or more of the exported schemas to validate their respective query/body parameters.
- **`src/modules/account/services/signup.ts`** — graph neighbor; likely consumes `optionalBooleanSchema` or `blankToUndefined` for its input validation.
- **`tests/cross-cutting/contract-scalars.test.ts`** (referenced in comments) — asserts the local constants still match what orval generates, guarding against silent drift.

## Notes

- The constants are *intentionally* not imported from the orval-generated client. Orval flattens one shared OpenAPI component into ~40 per-operation constants; importing any one would embed a domain name in `infrastructure` and break when that module's contract fragment is removed.
- `pageSchema` and `pageSizeSchema` are **optional, not defaulted**. Defaulting is the sole responsibility of `normalizePagination` in `@infrastructure/persistence/search`; adding defaults here would be redundant and harder to change.
- `paginationSchema` uses `z.strictObject` — passing an extra key is a 422, not ignored. Use a non-strict object if the endpoint genuinely accepts additional filters alongside pagination.
- `hardDeleteSchema` and `optionalBooleanSchema` both guard against the JavaScript trap where the string `'false'` is truthy; never replace them with `!!value` checks.
