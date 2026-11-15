---
source: scripts/contracts/generate-request-content-types.ts
sha256: 207ed8f38bac1c1b93c6437e5b8ad48038edd0bcf6037e1209d59c92c801fcd5
generated_at: 2026-11-14T17:25:53.885143+00:00
model: ollama:qwen3.8:27b
---

# scripts/contracts/generate-request-content-types.ts

## Purpose

Builds two generated TypeScript files from `openapi.yaml`: a **request content-type table** (one row per write operation with its accepted media types, consumed by the 415 `content-type` middleware) and an **operation-routes table** (one row per path with its declared methods, owning module, and security-open methods, consumed by the 405 `method-not-allowed` middleware). Both files carry pre-compiled regex literals so the runtime never builds matchers at boot.

## Key elements

- **`compileTemplate(template)`** — Splits a contract path like `/products/{id}/restore` on `{param}` tokens, escapes literal segments, joins with `[^/]+`, and returns a regex literal string (`/^…$/i`) plus the parameter count. Case-insensitive to match Express routing.
- **`renderRows()`** — Iterates `document.paths` × `WRITE_METHODS`, emits one `RequestContentType` row per operation that has a `requestBody`. Operations without a body get `types: []` (any body refused). Sorted by `parameterCount` ascending, then `key` locale-compare for stable diffs.
- **`renderRouteRows()`** — Iterates `document.paths`, emits one `OperationRoute` row per path listing upper-cased methods, the `x-module` owner (or `null`), and `securityOpenMethods`. Same sort order.
- **`output` / `routesOutput`** — Full file text (header comment, interface declaration, exported `readonly` array) for each generated file.
- **`writeOrCheck(OUTPUT, …)`** — Writes the content-types file to the `--out` path; writes the routes file into the same directory. Under `--check`, compares in place and exits 1 on mismatch.

## Relationships

- **`scripts/cli.ts`** — Provides `requiredPath('out', REPO_ROOT)` to parse the mandatory `--out` CLI argument.
- **`scripts/contracts/generated-file.ts`** — Provides `writeOrCheck`, which handles the write-vs-check logic and stamps the "generated from" source metadata.
- **`scripts/contracts/openapi-document.ts`** — Exports `parseOpenApi`, `HTTP_METHODS`, `WRITE_METHODS`, and `securityOpenMethods`, all consumed here.
- **`scripts/modules-on-disk.ts`** — Exports `REPO_ROOT`, used to locate `openapi.yaml` and to resolve the `--out` path.
- **`tests/cross-cutting/contract-error-declarations.test.ts`** — Cross-cutting test that exercises the generated contract declarations this script emits.

## Notes

- Only **write methods** (POST, PUT, PATCH, DELETE) appear in the content-types file; GET/HEAD have no body by contract.
- A write operation with **no** `requestBody` still gets a row with `types: []`, which the 415 guard interprets as "refuse any body."
- The routes file is written **next to** the `--out` path (same directory), named `operation-routes.ts`.
- Both generated files live under `api/` and are rebuilt from scratch by `npm run gen:api`; they are backend-only (no frontend equivalent).
- Sorting by fewest parameters first is load-bearing: the 415/405 guards iterate the array and match the first hit, so a static segment like `/products/search` must precede `/products/{id}`.
