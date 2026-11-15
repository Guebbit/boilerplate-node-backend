---
source: scripts/scaffold/scaffold-module.ts
sha256: d097c78291c0102bf56dea0ece90cc9d8d596e3c74ea918f7d711977de32bb5d
generated_at: 2026-11-14T17:42:04.970834+00:00
model: ollama:qwen3.8:27b
---

# scripts/scaffold/scaffold-module.ts

## Purpose

CLI entry point for `npm run scaffold:module -- <name> [options]`. It orchestrates the full "create a new module" flow: parses arguments, delegates file-writing to the scaffold applier, optionally triggers type regeneration, and prints the list of decisions the tool intentionally leaves to the developer.

## Key elements

- **`OPEN_DECISIONS`** (const array) — four hardcoded reminder strings (personalData, authorization roles, rate limits, TODOs) printed after a successful run so the author knows what to fill in.
- **`main(argv)`** — async entry function. Parses args via `parseArguments`, calls `applyScaffold`, conditionally spawns `npm run regenerate --no-sync` (blocking `spawnSync`), then prints `OPEN_DECISIONS`. Returns a numeric exit code.
- **Top-level invocation** — `main(process.argv.slice(2)).then(...)` sets `process.exitCode`; an uncaught rejection exits with code 1.

## Relationships

- **`scripts/scaffold/options.ts`** — supplies `parseArguments`, `isRefusal`, and `USAGE`; the sole source of CLI argument interpretation.
- **`scripts/scaffold/apply.ts`** — supplies `applyScaffold`, which performs the actual folder/file creation, docs generation, and registry registration.
- **`scripts/scaffold/format-text.ts`** — supplies `formatWithRepoConfig`, passed to `applyScaffold` as the text-formatter callback.
- **`scripts/modules-on-disk.ts`** — supplies `REPO_ROOT`, the resolved path to the repository root used as the working directory for all file operations and the `regenerate` subprocess.

## Notes

- Runs under **tsx** (`#!/usr/bin/env tsx`), not plain Node.
- `regenerate` is only invoked when the parsed `options.regenerate` flag is truthy; it uses `spawnSync` with `stdio: 'inherit'`, so its output streams directly to the terminal.
- A failure in `applyScaffold` is caught and converted to a `refused:` log line plus exit code 1; no rethrow.
- The file is a **script**, not a library: it executes its own `main` call at the bottom and is not intended to be imported.
