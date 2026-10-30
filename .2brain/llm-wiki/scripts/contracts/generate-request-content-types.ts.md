---
source: scripts/contracts/generate-request-content-types.ts
sha256: 3336d5b69c00a472d54ec858fdfc61c311aea37c3e91225ceceb8bfec8cc1e61
generated_at: 2026-10-29T01:30:48.253330+00:00
model: ollama:qwen3.8:27b
---

# scripts/contracts/generate-request-content-types.ts

## Purpose

Reads the bundled `openapi.yaml` and emits two generated TypeScript files: a request content-type table (consumed by the 415 `Content-Type` middleware) and an operation-routes table (consumed by the 405 `Method Not Allowed` middleware). It exists so that the HTTP guard can reject unsupported media types and wrong methods at boot-time-compiled patterns rather than building matchers per-request, and so that writes with no declared body are explicitly refused instead of silently accepting an empty `{}`.

## Key elements

- **`compileTemplate(template)`** – Converts an OpenAPI path template (e.g. `/products/{id}/restore`) into a case-insensitive regex literal (`/^\/products\/[^/]+\/restore$/i`) plus a `parameterCount`. Regex metacharacters in static segments are escaped.
- **`renderRows()`** – Produces one row per `(BODY_METHODS, path)` pair that has an operation. Rows carry `method`, `pattern`, `parameterCount`, and the declared `content` keys. Operations with no `requestBody` still emit a row with `types: []`.
- **`renderRouteRows()`** – Produces one row per path listing all declared methods and the `x-module` owner (or `null` for system routes).
- **`output` / `routesOutput`** – Pre-assembled full-file source text (header comments + interface + `export const` array) for the two generated artifacts.
- **`writeOrCheck(…, 'openapi.yaml')`** – Two calls at the bottom: one writes the content-types file to `--out`, the other writes `operation-routes.ts` into the same directory. Under `--check` neither writes; a mismatch exits 1.
- **`PATH_METHODS` / `BODY_METHODS`** – Constants defining all seven path-item methods and the four methods (POST, PUT, PATCH, DELETE) whose bodies the guard checks.
- **`OperationObject` / `OpenApiDocument`** – Narrow structural interfaces describing the slice of the YAML document this script actually reads.

## Relationships

- **`scripts/contracts/generated-file.ts`** – Imports `writeOrCheck`, the shared helper that either writes the rendered text to disk or diffs it against the existing file under `--check`.
- **`scripts/cli.ts`** – Imports `requiredPath`, a CLI-argument parser that resolves the `--out` flag relative to the repo root.
- **`openapi.yaml` (repo root)** – The sole input; parsed with the `yaml` package's `parse` (YAML 1.2 loader) and cast to `OpenApiDocument`.
- **Generated outputs (sibling files under `api/`)** – Consumed at runtime by `src/infrastructure/http/middlewares/content-type.ts` (415 guard) and `src/infrastructure/http/middlewares/method-not-allowed.ts` (405 handler). Both are rebuilt from scratch by `npm run gen:api`.

## Notes

- Runs as **ESM** (`import.meta.url` instead of `__dirname`); invoked via `tsx`.
- Rows are sorted fewest `parameterCount` first, then lexicographically, so static segments match before parameterized ones and regeneration produces a **stable diff**.
- The regex is intentionally **case-insensitive** (`/i`) to mirror Express's routing behavior.
- A write method that exists in the document but has **no `requestBody`** still gets a row with an empty `types` array—this is how the 415 guard refuses *any* body for that operation.
- The `x-module` extension is stamped by the API bundler, not by the OpenAPI spec author; it is absent on system routes (ping, probes), which render as `module: null`.
- `--out` names only the content-types file; `operation-routes.ts` is always placed in the same directory automatically.
