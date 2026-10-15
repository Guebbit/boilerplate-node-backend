---
source: scripts/contracts/generate-request-content-types.ts
sha256: d922f2ba35274d5c7a9c26daa6a4e0ef1d015b9bdf385552449bc8f6395770e2
generated_at: 2026-10-15T09:38:10.199949+00:00
model: ollama:qwen3.8:27b
---

# scripts/contracts/generate-request-content-types.ts

## Purpose

Generates a request media-type lookup table (`REQUEST_CONTENT_TYPES`) from `openapi.yaml`. For every operation that declares a `requestBody`, it records the accepted content types alongside a pre-compiled regex path matcher. The output is consumed by the 415 content-type guard (`src/infrastructure/http/middlewares/content-type.ts`), which rejects bodies in undeclared types. The script is part of the `npm run gen:api` pipeline and writes a committed file under `api/`.

## Key elements

- **`BODY_METHODS`** — tuple of the four methods that may carry a body (`post`, `put`, `patch`, `delete`); `get`/`head` are excluded.
- **`compileTemplate(template)`** — converts an OpenAPI path template (e.g. `/products/{id}/restore`) into a regex literal string (`/^\/products\/[^/]+\/restore$/`) and returns the parameter count. Literal is embedded in the generated file so the guard never compiles a matcher at boot.
- **`renderRows()`** — iterates all paths × body-carrying methods, collects declared content-type keys, and emits one row object per operation. Rows are sorted by fewest path parameters first (more specific paths matched before less specific), ties broken by key for stable diffs.
- **`output`** — the full generated-file text: a `RequestContentType` interface plus the `REQUEST_CONTENT_TYPES` readonly array literal.
- **`OperationObject` / `OpenApiDocument`** — narrow structural interfaces for the subset of the OpenAPI spec this script reads.
- **`writeOrCheck(OUTPUT, output, 'openapi.yaml')`** — final call; writes the file or, under `--check`, diffs it against disk and exits 1 on mismatch.

## Relationships

- **`scripts/cli.ts`** — provides `requiredPath`, which parses the mandatory `--out` CLI argument and resolves it to an absolute path relative to the repo root.
- **`scripts/contracts/generated-file.ts`** — provides `writeOrCheck`, the shared helper that either writes the generated content or compares it against the existing file in `--check` mode.

## Notes

- The script is **backend-only**; there is no frontend equivalent.
- Runs as ESM (uses `import.meta.url` rather than `__dirname`) via the `tsx` shebang.
- Generated rows are sorted fewest-parameters-first so that static segments (e.g. `/products/search`) are matched before parameterised ones (`/products/{id}`) at runtime.
- The `--check` mode writes nothing; it is intended for CI to detect stale generated output.
- The generated file carries a `DO NOT EDIT` header; it is rebuilt from scratch by `npm run gen:api`.
