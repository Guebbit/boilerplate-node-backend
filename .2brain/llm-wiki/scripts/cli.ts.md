---
source: scripts/cli.ts
sha256: d9ea6dfdc2e45baecac73fc72ed87f857ec6918330a9f1eef07d4e1a1fd27625
generated_at: 2026-10-15T09:34:48.140773+00:00
model: ollama:qwen3.8:27b
---

# scripts/cli.ts

## Purpose

Shared CLI-argument helpers for the repo's standalone scripts. Replaces per-script hand-rolled `indexOf`/`startsWith` parsing with a single, lenient wrapper around `node:util`'s `parseArgs`, so every script gets consistent `--flag value` / `--flag=value` handling.

## Key elements

- **`flagValue(flag, argv?)`** — Returns the string value for the named flag (dashes omitted), or `undefined` if the flag is absent or value-less. Defaults to `process.argv.slice(2)`. Uses `strict: false` and `allowPositionals: true` so unknown flags and bare positionals never throw.
- **`requiredPath(flag, root)`** — Calls `flagValue`; if the value is missing, prints a usage line to stderr and calls `process.exit(1)`. Otherwise resolves the value against `root` with `path.resolve` and returns the absolute path.

## Relationships

Both exports are imported by the consumer scripts listed in the dependency graph:

- `scripts/contracts/*` (check-asyncapi-breaking, generate-asyncapi-types, generate-error-codes, generate-permission-actions, generate-request-content-types)
- `scripts/mutation/*` (check-baseline, ci/cli, run-diff, run-shards)
- `scripts/testing/measure-demo-strip.ts`

These scripts call `flagValue` for optional flags and `requiredPath` for mandatory path arguments, keeping their own parsing logic to a single-line call.

## Notes

- `requiredPath` **exits the process** (`process.exit(1)`) when the flag is missing. Callers cannot catch or continue after it; treat it as a terminal guard.
- `strict: false` is deliberate: `npm run x -- --flag` and CI runners inject their own flags; throwing on unknown flags would break those invocations.
- `flagValue` treats `--flag` (no value) the same as a missing flag — it returns `undefined`. For boolean-style flags, call sites must handle the `undefined` case explicitly.
- The second argument (`argv`) exists for testability; production call sites rely on the default (`process.argv.slice(2)`).
