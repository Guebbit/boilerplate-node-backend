---
source: scripts/contracts/generate-redirect-query.ts
generated_at: 2026-11-22T01:56:51.848742+00:00
model: claude-code:claude-sonnet-5-5
---

# scripts/contracts/generate-redirect-query.ts

## Purpose
A `tsx` script that reads `openapi.yaml` and generates a TypeScript file exporting the closed sets of values a redirect puts in its query string. Every `302` response declaring `x-redirect-query` (a map of parameter name to an enum schema) becomes an entry keyed by operation id, then parameter. The motivating case is the OAuth callback's `?error=` codes, which are the only way a client learns why the round trip failed.

## Key elements
- `RedirectQuery` (type): shape of a response's `x-redirect-query`, mapping parameter name to `{ enum?: string[] }`.
- `INPUT`: absolute path to `openapi.yaml` under `REPO_ROOT`.
- `OUTPUT`: absolute path of the file to generate, taken from the required `--out` argument.
- `enums`: accumulator of operation id → parameter name → allowed values.
- `collectEnums(operation)`: walks an operation's responses, reads the vendor key `x-redirect-query` (cast, since the OpenAPI types don't declare it), and records each parameter's enum. Entries are skipped if the operation has no `operationId` or the schema has no `enum`.
- `output`: the generated file text. It has a "do not edit" header and exports `REDIRECT_QUERY_ENUMS`, the `enums` object serialized as JSON (4-space indent) with `as const`.

The script runs at module top level: it parses the spec, collects enums for every operation, then calls `writeOrCheck`.

## Relationships
- `scripts/cli.ts`: provides `requiredPath`, used to resolve the `--out` argument.
- `scripts/modules-on-disk.ts`: provides `REPO_ROOT`, used to locate `openapi.yaml` and to resolve `--out`.
- `scripts/contracts/openapi-document.ts`: provides `parseOpenApi`, `operationsOf` and the `Operation` type, used to parse the spec text and iterate its operations.
- `scripts/contracts/generated-file.ts`: provides `writeOrCheck`, which writes the output, or under `--check` compares it to the file on disk and exits 1 on mismatch (nothing is written).

## Notes
- Usage: `tsx scripts/contracts/generate-redirect-query.ts --out <path> [--check]`.
- The enum is written inline in the fragment rather than as a component schema. The bundler inlines a `$ref` under an `x-` key and prunes the component, so a `$ref` would not survive.
- The header names `npm run gen:api` as the regeneration command.
- Output goes beside the backend's other generated contract files under `api.generated/`. The frontend's route-table generator writes the same table into its own routes file.
- The code collects enums from every response of every operation. The `302`-only scope in the doc comment is not enforced in the code.
