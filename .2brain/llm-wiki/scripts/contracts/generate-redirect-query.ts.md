---
source: scripts/contracts/generate-redirect-query.ts
sha256: 829b0b24e8a710791e1c2ed1f8e11553e9138642aabb5a8a3d554ef2e4505d96
generated_at: 2026-11-14T17:25:18.802701+00:00
model: ollama:qwen3.8:27b
---

# scripts/contracts/generate-redirect-query.ts

## Purpose

Extracts the closed enum sets that a redirect encodes in its query string from `openapi.yaml` and emits a TypeScript constant (`REDIRECT_QUERY_ENUMS`). It walks every operation's responses for the `x-redirect-query` vendor extension and produces a lookup of `operationId → parameterName → string[]`. The primary use-case is the OAuth callback's `?error=` codes, where the redirect is the only channel a client learns why a round-trip failed.

## Key elements

- **`RedirectQuery`** — local type describing the shape of the `x-redirect-query` value: `Record<string, { enum?: string[] }>`.
- **`INPUT` / `OUTPUT`** — resolved paths; input is `openapi.yaml` at repo root, output comes from the `--out` CLI flag.
- **`enums`** — the accumulator object (`Record<operationId, Record<paramName, string[]>>`) populated while scanning.
- **`collectEnums(operation)`** — iterates an operation's responses, reads `x-redirect-query`, and stores each parameter's `enum` array keyed by `operationId`. Skips operations lacking an `operationId` or parameters without an `enum`.
- **Generated output string** — a self-contained `.ts` file exporting `REDIRECT_QUERY_ENUMS` as a `const` (the full JSON of `enums`, 4-space-indented).
- **`writeOrCheck(…)` call** — writes the file normally or, under `--check`, diffs against disk and exits 1 on mismatch.

## Relationships

- **`scripts/cli.ts`** — imports `requiredPath` to parse and validate the `--out` argument.
- **`scripts/contracts/generated-file.ts`** — imports `writeOrCheck` for the write-or-verify pattern.
- **`scripts/contracts/openapi-document.ts`** — imports `parseOpenApi`, `operationsOf`, and the `Operation` type to read and iterate the spec.
- **`scripts/modules-on-disk.ts`** — imports `REPO_ROOT` to anchor path resolution for both the input and output locations.

## Notes

- `x-redirect-query` is a vendor key absent from the OpenAPI TypeScript types; the code casts the response object to access it.
- The enum is intentionally inlined in the fragment (not a `$ref` component) because the bundler inlines `$ref` under `x-` keys and would prune the referenced component.
- The generated file lives under `api/` alongside the backend's other generated contracts. The frontend's route-table generator independently writes the same table into its own routes file.
- The script is executed via `tsx` (see the shebang); no compile step is needed.
- Only operations that have both an `operationId` **and** an `x-redirect-query` response are included; everything else is silently skipped.
