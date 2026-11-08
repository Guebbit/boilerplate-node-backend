---
source: scripts/cli.ts
sha256: 0d9b0674717343ea2315c3129429192110f5c059846b1c551a64fb8f0ff421d6
generated_at: 2026-11-08T02:37:49.638274+00:00
model: ollama:qwen3.8:27b
---

# scripts/cli.ts

## Purpose

Shared CLI-argument parsing helper for standalone scripts. Wraps `node:util`'s `parseArgs` with a minimal API (`flagValue`, `hasFlag`, `requiredPath`) so individual scripts don't hand-roll `indexOf`/`startsWith` logic for each `--flag` they accept.

## Key elements

- **`flagValue(flag)`** — Returns the string value of `--flag value` / `--flag=value`, or `undefined` if absent. The flag name is passed *without* dashes.
- **`hasFlag(flag)`** — Returns `true` when a boolean switch (`--flag`, no value) was provided.
- **`requiredPath(flag, root)`** — Like `flagValue` but calls `process.exit(1)` with a usage line when missing; otherwise resolves a relative value against `root` via `path.resolve` and returns the absolute path.
- **`scriptArguments()`** (internal) — Reads `process.argv.slice(2)` at *call time* rather than module-load time, so tests can reassign `process.argv` between invocations.

## Relationships

Every script under `scripts/contracts/`, `scripts/db/`, and `scripts/docs/` (e.g. `generate-asyncapi-types.ts`, `sync-indexes.ts`, `generate-jobs.ts`) imports from this module to parse its own command-line flags. This file is a leaf dependency: it imports only `node:path` and `node:util`, and no project-internal modules.

## Notes

- `parseArgs` is called with `strict: false` and `allowPositionals: true` so that unknown flags (e.g. ones npm injects) and bare positionals don't throw.
- `requiredPath` terminates the process (`exit(1)`) rather than throwing; callers should not wrap it in `try/catch`.
- Because `scriptArguments()` reads `process.argv` lazily, the module is safe to import once and call repeatedly with different argv values (relevant for test suites).
