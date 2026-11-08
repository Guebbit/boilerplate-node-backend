---
source: scripts/contracts/generate-error-codes.ts
sha256: 9113f9abe7b69ba519b3351582d6ffaabf63b667288d98fccbab250119ace0c5
generated_at: 2026-11-08T02:41:32.027720+00:00
model: ollama:qwen3.8:27b
---

# scripts/contracts/generate-error-codes.ts

## Purpose

Generates a TypeScript constants object (`ERROR_CODES`) and a derived string-union type (`ErrorCode`) from the `x-error-codes` extension field in the shared `openapi.yaml`. It exists so call sites can reference typed error-code names (with hover-able status/description) instead of retyping raw strings, while keeping the contract's `errors[].code` as a plain `type: string` (no `enum`) per Zalando API guideline #112.

## Key elements

- **`ErrorCodeEntry`** — interface for a single `x-error-codes` record (`status: number`, `description: string`).
- **`OpenApiDocument`** — the minimal slice of the YAML document this script reads (only `x-error-codes`).
- **`renderRow(code)`** — produces one `key: value` line plus a two-line JSDoc (`/** 409 — … */`) for a single code.
- **`ERROR_CODES`** (generated output) — `as const` object mapping every declared code to itself.
- **`ErrorCode`** (generated output) — union type `(typeof ERROR_CODES)[keyof typeof ERROR_CODES]`; explicitly *not* exhaustive at the type level.
- **`ROOT` / `INPUT` / `OUTPUT`** — resolved paths; `INPUT` is always `<repo-root>/openapi.yaml`, `OUTPUT` comes from the `--out` CLI flag.
- **`writeOrCheck(OUTPUT, output, 'openapi.yaml')`** — writes the file or, under `--check`, diffs against disk and exits 1 on mismatch.

## Relationships

- **`scripts/cli.ts`** — supplies `requiredPath`, which parses the `--out` CLI argument and resolves it to an absolute path rooted at the repo root.
- **`scripts/contracts/generated-file.ts`** — supplies `writeOrCheck`, the shared write-or-verify helper every generator in this family uses for its `--check` contract.

## Notes

- **Shared script**: byte-identical in both repos of the pair; both write an `error-codes.ts` beside their other generated contract types. The input `openapi.yaml` is the same bundled file in both.
- **Not a Zod enum by design**: a new code is additive and never a breaking response change; the type here is open-ended, so nothing rejects a code the contract doesn't yet declare.
- **Sorted keys** (`Object.keys(…).toSorted()`) so the generated file is stable across runs and doesn't churn in diffs.
- **ESM script**: uses `import.meta.url` (not `__dirname`); run via `tsx`.
- **`--check` contract**: writes nothing, exits 1 on mismatch — identical behavior across the generator family.
- **`Object.hasOwn` guard** in `renderRow` mirrors the same pattern in `generate-asyncapi-types.ts`; every key in `codes` is guaranteed declared, but the guard makes the invariant explicit.
