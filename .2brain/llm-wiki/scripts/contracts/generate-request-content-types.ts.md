---
source: scripts/contracts/generate-request-content-types.ts
sha256: 4a3af7698024193b688bc450d920ea6cf8bf3ef7ebe816cfb991d8ac81029967
generated_at: 2026-11-08T02:42:02.901204+00:00
model: ollama:qwen3.8:27b
---

# scripts/contracts/generate-request-content-types.ts

## Purpose

Code-generation script that reads `openapi.yaml` and emits two TypeScript files under `api/`: a request content-types table consumed by the 415 Content-Type guard, and an operation-routes table consumed by the 405 Method-Not-Allowed handler. Both files carry pre-compiled regex literals so the runtime guards never build a matcher at boot. Rebuilt from scratch by `npm run gen:api`.

## Key elements

- **`compileTemplate(template)`** – Converts a contract path (e.g. `/products/{id}/restore`) into a case-insensitive regex literal and counts `{param}` segments. Escapes regex-special characters in static segments; replaces each `{param}` with `[^/]+`.
- **`renderRows()`** – Produces one row per **write** method (POST/PUT/PATCH/DELETE) operation that has a `requestBody`. A write with no declared body yields `types: []`, causing any body to be refused. Sorted by parameter count, then key, for stable diffs.
- **`renderRouteRows()`** – Produces one row per contract path listing declared methods, the owning `x-module`, and `securityOpenMethods` (methods with `security: []`).
- **`routesOutput` / `output`** – Full source-text of the two generated files (`operation-routes.ts` and the content-types file), each exporting a typed interface and a `readonly` array.
- **`writeOrCheck(OUTPUT, output, …)`** and a second call for the routes file – Writes under normal runs, or compares against disk and exits 1 on mismatch under `--check`.
- **CLI surface** – `--out <path>` (required, via `requiredPath`) names the content-types file; the routes file is placed alongside it. `--check` is the only other flag.

## Relationships

- **`scripts/cli.ts`** – Imports `requiredPath`, the shared helper that parses and validates the `--out` flag against the repo root.
- **`scripts/contracts/generated-file.ts`** – Imports `writeOrCheck`, the shared write-or-diff helper used by all contract generators.
- **`scripts/contracts/openapi-document.ts`** – Imports `parseOpenApi` (YAML → document), `HTTP_METHODS`, `WRITE_METHODS` (method lists), and `securityOpenMethods` (extracts methods declaring `security: []`).

## Notes

- Regex literals are case-insensitive (`/i`) to match Express's case-insensitive routing (`/Account` must be gated the same as `/account`).
- The script writes **two** files, not one: the content-types file at the `--out` path and `operation-routes.ts` in the same directory.
- Sorting is by `parameterCount` ascending, then lexicographic key—this puts static segments before parameterised ones and keeps regeneration diffs minimal.
- Uses `import.meta.url` (not `__dirname`) because the script runs as ESM under `tsx`.
- Backend-only; the frontend has no HTTP guard to feed.
