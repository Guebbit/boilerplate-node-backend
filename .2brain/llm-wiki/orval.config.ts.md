---
source: orval.config.ts
sha256: 38d544f87af3f69f5e42ed87e040eeb8f2747b76f403d76c56c0fde0b9114e09
generated_at: 2026-09-23T17:15:45.743526+00:00
model: ollama:qwen3.8:27b
---

# orval.config.ts

## Purpose

Orval configuration that generates Zod validators and TypeScript model types from `openapi.yaml`. It exists so that runtime validation and shared type imports (`@api/schemas.zod`, `@api/models`) stay in sync with the API contract without manual maintenance.

## Key elements

- **`zodSchemas`** – The sole config block. Points to `./openapi.yaml` and emits:
  - `./api/schemas.zod.ts` – Zod schema definitions (operation input validators).
  - `./api/models/` – Raw TypeScript interfaces for all request/response models.
- **`output.mode: 'single'`** – All generated schemas land in one file rather than being split by tag or operation.
- **`output.client: 'zod'`** – Instructs Orval to emit only schema/type code; no `fetch`/`axios`/react-query call-functions are generated (nothing in this repo consumes them).
- **`override.zod.strict: { body: true }`** – Adds `.strict()` to request-body schemas so unknown keys are *rejected* rather than silently stripped. Response schemas are intentionally left non-strict.

## Notes

- The `strict` override is **body-only** on purpose: no controller reads generated response schemas at runtime, so extending strictness there would add risk with no benefit.
- Because `client` is set to `'zod'`, the `schemas` output path still produces the model interfaces even though no HTTP-client code is generated. Removing the `schemas` key would break `@api/models` imports.
- If the project later adds an HTTP client (e.g., `fetch` or `axios`), change `client` accordingly; the `strict` override still applies to body schemas regardless of client choice.
- Switching `mode` to `'tags'` or `'split'` will change the import paths expected by `@api/schemas.zod` and `@api/models` aliases—update `tsconfig` paths in tandem.
