---
source: scripts/contracts/generate-error-codes.ts
sha256: 9b8294957086a0621f7550b5f708ad82da2ee8fc21b1a2ef95e8bd93e00636da
generated_at: 2026-11-14T17:24:46.757561+00:00
model: ollama:qwen3.8:27b
---

# scripts/contracts/generate-error-codes.ts

## Purpose

Generates `error-codes.ts` — a `const` object (`ERROR_CODES`) and its derived union type (`ErrorCode`) — from the `x-error-codes` extension in `openapi.yaml`. The catalogue exists so call sites can reference codes by name (compiler catches typos/removed codes) while the wire contract stays open-ended (`code: string`, no `enum`), making new codes additive rather than breaking. The script is byte-identical in both repos of the pair.

## Key elements

- **`ErrorCodeEntry`** — interface for one `x-error-codes` value (`status`, `description`).
- **`OpenApiDocument`** — the minimal slice of the YAML doc this file reads (`x-error-codes`).
- **`INPUT` / `OUTPUT`** — resolved paths; `INPUT` is always `<REPO_ROOT>/openapi.yaml`, `OUTPUT` comes from `--out`.
- **`renderRow(code)`** — emits one `key: value` line prefixed with a two-line JSDoc carrying the code's `status` and `description`.
- **`output`** — the full generated file text: header banner, `ERROR_CODES` const, and `ErrorCode` type alias.
- **`writeOrCheck(OUTPUT, output, 'openapi.yaml')`** — writes the file, or under `--check` diffs against disk and exits 1 on mismatch.

## Relationships

- **`scripts/cli.ts`** — provides `requiredPath`, the shared helper for parsing the `--out` CLI argument.
- **`scripts/contracts/generated-file.ts`** — provides `writeOrCheck`, the common write-or-validate primitive every generator in this family uses.
- **`scripts/modules-on-disk.ts`** — provides `REPO_ROOT`, the resolved repository root used to anchor `INPUT` and default the `--out` path.

## Notes

- **Not a Zod enum, by design.** The contract intentionally keeps `errors[].code` as plain `string` (Zalando guideline #112). The generated type is a *convenience*, not a closed set — it does not reject unknown codes at runtime.
- **Sorted keys.** `Object.keys(...).toSorted()` guarantees stable output so the file doesn't churn between runs.
- **`--check` contract.** Like every generator in the `scripts/contracts/` family, `--check` writes nothing and exits 1 on a mismatch, making it CI-friendly.
- **Shared across the repo pair.** The same `x-error-codes` map is bundled once in the backend and travels to the frontend inside the shared `openapi.yaml`; this script is the single point of codegen in both repos.
