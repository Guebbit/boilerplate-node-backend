---
source: scripts/contracts/generate-error-codes.ts
source_sha256: 0238624505153e6c5672eccfc77ffc07e9d40c8b563d343ea89651d0553af282
context_sha256: 995abe628e3d862e96749604af50b6d3b1b1fd9a360101fc201022927f1ec68c
generated_at: 2026-11-22T01:56:28.429919+00:00
model: claude-code:claude-sonnet-5-5
---

# scripts/contracts/generate-error-codes.ts

## Purpose
A script that reads `x-error-codes` from the root OpenAPI contract and generates a TypeScript file holding an `ERROR_CODES` constants object and an `ErrorCode` union type derived from it. The script is shared byte-identical between a pair of repos (backend and frontend), and both read the same contract file. It uses constants rather than a Zod enum so that adding a code stays additive and not a breaking contract change.

## Key elements
- `ErrorCodeEntry` / `OpenApiDocument`: minimal types for the slice of the OpenAPI document that is read. Each entry has `status` and `description`.
- `INPUT`: the contract file path, resolved against `REPO_ROOT`.
- `OUTPUT`: the target path, taken from the required `--out` argument.
- `document`: the YAML file, parsed with the `yaml` package and cast to `OpenApiDocument`.
- `errorCodes` / `codes`: the declared codes (empty if none), with names sorted so the output is stable between runs.
- `renderRow(code)`: renders one property as `"CODE": "CODE",`. Above it is a JSDoc line of the form `/** <status> — <description> */`, so the meaning shows on hover in the editor. A missing entry falls back to status `0` and an empty description.
- `output`: the full generated file text. It has a "DO NOT EDIT" header, `export const ERROR_CODES = {...} as const`, and `export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES]`.
- The final `writeOrCheck(OUTPUT, output, ...)` call writes the file, or compares it with what is on disk.

## Relationships
- `scripts/cli.ts`: provides `requiredPath`, which resolves the `--out` argument into `OUTPUT`.
- `scripts/contracts/generated-file.ts`: provides `writeOrCheck`, which writes the output or, under `--check`, writes nothing and exits 1 on a mismatch.
- `scripts/modules-on-disk.ts`: provides `REPO_ROOT`, used to locate the contract file and to resolve `--out`.

## Notes
- The `ErrorCode` type is not exhaustive. Nothing rejects a code the contract does not know. The compiler only catches typos and removed codes at call sites that use `ERROR_CODES.X`.
- `errors[].code` stays `type: string` with no `enum` in the contract (Zalando guideline #112).
- `renderRow` uses `Object.hasOwn` rather than a nullish check. The fallback values are defensive, since `codes` comes from the object's own keys.
- The generated header says to regenerate with `npm run gen:api`.
- Usage: `tsx scripts/contracts/generate-error-codes.ts --out <path> [--check]`.
- The script does all its work at module top level, with no exports. Importing it would run the generation.
