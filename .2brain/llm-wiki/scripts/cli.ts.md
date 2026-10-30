---
source: scripts/cli.ts
sha256: 0d9b0674717343ea2315c3129429192110f5c059846b1c551a64fb8f0ff421d6
generated_at: 2026-10-29T01:28:54.202275+00:00
model: ollama:qwen3.8:27b
---

# scripts/cli.ts

## Purpose

Small shared utility that standardises how project scripts read their command-line flags (`--flag value`, `--flag=value`, `--flag`). It wraps `node:util`'s `parseArgs` so individual scripts don't each hand-roll argument parsing, and it is deliberately lenient (`strict: false`) so unknown flags and positionals pass through without throwing.

## Key elements

- **`flagValue(flag: string): string | undefined`** — Returns the string value given to `--flag`. Returns `undefined` when the flag is absent or was passed as a bare switch.
- **`hasFlag(flag: string): boolean`** — Returns `true` when the boolean switch `--flag` was present, `false` otherwise.
- **`requiredPath(flag: string, root: string): string`** — Calls `flagValue`, prints a usage hint and `process.exit(1)` if the value is missing; otherwise returns `path.resolve(root, value)`.
- **`scriptArguments(): string[]`** (module-private) — Reads `process.argv.slice(2)` at call time rather than import time, so tests can mutate `process.argv` before invoking the helpers.

## Relationships

- **`scripts/contracts/*` and `scripts/docs/*`** (e.g. `generate-asyncapi-types.ts`, `generate-error-codes.ts`, `sync-indexes.ts`, `generate-jobs.ts`, `generate-dependency-map.ts`, etc.) — These are the direct consumers. Each script imports one or more of the three exported helpers to read its own CLI flags instead of parsing `process.argv` inline.

## Notes

- `strict: false` is intentional: `npm run x -- --flag` lets npm inject its own flags, and unknown flags must not crash a script that only cares about one or two of its own.
- `scriptArguments` is called inside each helper, not at module scope. This matters for tests (they can set `process.argv` after import) and for `node -e` invocations where `argv` shape differs.
- `requiredPath` terminates the process; it is not a pure function. Callers should treat it as the last step in argument validation.
- Flag names are passed **without** the leading dashes (e.g. `flagValue("input")` matches `--input`).
