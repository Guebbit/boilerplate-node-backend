---
source: scripts/contracts/generate-error-codes.ts
sha256: 9113f9abe7b69ba519b3351582d6ffaabf63b667288d98fccbab250119ace0c5
generated_at: 2026-10-15T09:37:50.721880+00:00
model: ollama:qwen3.8:27b
---

# scripts/contracts/generate-error-codes.ts

## Purpose
Generates a TypeScript `ERROR_CODES` constants object and an `ErrorCode` union type from the `x-error-codes` extension in `openapi.yaml`. It exists so call sites can reference error codes as typed constants (catching typos and removed codes at compile time) while the contract itself keeps `errors[].code` as an open `string` — a new code is additive, never a breaking response change (Zalando API guideline #112).

## Key elements
- **`ErrorCodeEntry`** — interface describing one entry in `x-error-codes` (`status: number`, `description: string`).
- **`OpenApiDocument`** — interface narrowing the slice of the YAML document this script reads (`'x-error-codes'`).
- **`renderRow(code)`** — renders a single `key: value` property with a two-line JSDoc comment (`/** status — description */`).
- **`codes`** — `Object.keys(errorCodes).toSorted()`; sorted to keep the generated file stable across runs.
- **`output`** — the full generated file: header banner, `export const ERROR_CODES = { … } as const`, and `export type ErrorCode = …`.
- **`requiredPath('out', ROOT)`** (from `../cli`) — resolves the `--out` CLI argument into an absolute path.
- **`writeOrCheck(OUTPUT, output, 'openapi.yaml')`** (from `./generated-file`) — writes the file, or under `--check` compares it to disk and exits 1 on mismatch.

## Relationships
- **`scripts/cli.ts`** — provides `requiredPath`, used to parse the required `--out` CLI flag and resolve it relative to the repo root.
- **`scripts/contracts/generated-file.ts`** — provides `writeOrCheck`, the shared write-or-verify primitive used by every generator in this family.

## Notes
- **Shared script:** byte-identical in both repos of the pair. Both read the same `openapi.yaml` (bundled once in the backend from per-module fragments).
- **Not a Zod enum:** the generated constants object is deliberately plain — the contract's `errors[].code` has no `enum`, so the `ErrorCode` union is a *subset* of what the wire format permits, not a constraint on it.
- **`Object.hasOwn` guard** in `renderRow` is a defensive check; every key in `codes` is guaranteed to exist in `errorCodes` by construction.
- **ESM context:** uses `import.meta.url` (not `__dirname`) for path resolution.
- **`--check` mode:** writes nothing; exits 1 if the on-disk file differs from the rendered output.
