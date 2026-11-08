---
source: scripts/contracts/generate-redirect-query.ts
sha256: 20ecc676ba90bbf89574d9c1df378db31c4a91d03fe1d7dde11ffcbebdba6d03
generated_at: 2026-11-08T02:41:51.227947+00:00
model: ollama:qwen3.8:27b
---

# scripts/contracts/generate-redirect-query.ts

## Purpose

Generates a TypeScript constant (`REDIRECT_QUERY_ENUMS`) that lists every query-parameter value a redirect may emit, extracted from the `x-redirect-query` vendor extension on `302` responses in `openapi.yaml`. This gives the frontend (and any other consumer) a typed, closed set of values—most notably the OAuth callback `?error=` codes—without duplicating the definition.

## Key elements

- **`RedirectQuery`** (type alias) — shape of the `x-redirect-query` value: a record of parameter name → `{ enum?: string[] }`.
- **`enums`** (module-level `Record<string, Record<string, string[]>>`) — accumulates operation-id → parameter → allowed values across all responses.
- **`collectEnums(operation)`** — iterates an operation's responses, reads the `x-redirect-query` key (cast past the OpenAPI types that don't declare vendor keys), and records each enum into `enums` keyed by `operationId`.
- **Main loop** — parses `openapi.yaml` via `parseOpenApi` + `operationsOf`, then calls `collectEnums` on every operation.
- **`output`** (string) — the full generated file text: a "DO NOT EDIT" banner followed by `export const REDIRECT_QUERY_ENUMS = … as const`.
- **`writeOrCheck(OUTPUT, output, 'openapi.yaml')`** — writes the file, or (with `--check`) compares against disk and exits 1 on mismatch.

## Relationships

- **`scripts/cli.ts`** — imports `requiredPath` to resolve the mandatory `--out` CLI argument relative to the repo root.
- **`scripts/contracts/generated-file.ts`** — imports `writeOrCheck` for the standard write-or-diff behavior shared by all contract generators.
- **`scripts/contracts/openapi-document.ts`** — imports `parseOpenApi`, `operationsOf`, and the `Operation` type to read and iterate the bundled OpenAPI document.

## Notes

- Enums are stored **inline** in the YAML fragment rather than as a component schema, because the bundler inlines `$ref` under an `x-` key and then prunes the component. Do not "fix" this into a shared schema.
- The script runs as **ESM** (`import.meta.url`, not `__dirname`); keep it that way if adding imports.
- The frontend's route-table generator writes the *same* enum table into its own routes file—both sides are generated from the same `openapi.yaml` source.
- `--check` mode is used in CI; it produces no file write.
