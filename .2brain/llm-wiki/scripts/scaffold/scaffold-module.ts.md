---
source: scripts/scaffold/scaffold-module.ts
sha256: df5b496cac347cd1b1be5f93f7b8a2602aa02d779ad8bd5188b6ef9dc9bef706
generated_at: 2026-10-15T09:47:26.745358+00:00
model: ollama:qwen3.8:27b
---

# scripts/scaffold/scaffold-module.ts

## Purpose

CLI entry point (`npm run scaffold:module -- <name> [options]`) that generates a new module folder, its docs page, and registry entries from a template, optionally triggers a type/schema regeneration, and then prints a fixed list of decisions the author must still make. It is the thin orchestration layer around the actual file-writing logic in `apply.ts`.

## Key elements

- **`OPEN_DECISIONS`** – Constant array of five human-readable strings (personal data, roles, rate limits, frontend pairing, TODOs) that are always printed after a successful scaffold run.
- **`main(argv)`** – Async function that: parses args, calls `applyScaffold` to produce a `plan`, logs the file count, optionally `spawnSync`s `npm run regenerate -- --no-sync`, then prints `OPEN_DECISIONS`. Returns a numeric exit code.
- **Entry-point block** – Calls `main(process.argv.slice(2))`, sets `process.exitCode` from the resolved code, and catches any thrown error (exit 1).

## Relationships

- **`scripts/scaffold/apply.ts`** – Source of `applyScaffold(REPO_ROOT, options, formatter)`, the function that actually plans and writes the generated files.
- **`scripts/scaffold/format-text.ts`** – Provides `formatWithRepoConfig`, passed as the formatter callback into `applyScaffold` so generated text is linted/formatted before being written.
- **`scripts/scaffold/options.ts`** – Provides `parseArguments`, `isRefusal`, and `USAGE` for CLI argument handling and early-exit on bad input.
- **`scripts/modules-on-disk.ts`** – Provides `REPO_ROOT`, the absolute path used as `cwd` for both the scaffold and the spawned `regenerate` command.

## Notes

- `regenerate` is **opt-in** via `options.regenerate`; by default the script does not spawn any child process.
- On a failed `applyScaffold` call the error is caught, logged, and converted to `undefined` so `main` simply returns 1 — no unhandled rejection.
- `OPEN_DECISIONS` is a fixed list; it is not derived from the module name or options. The author is expected to act on it after every scaffold.
- The shebang (`#!/usr/bin/env tsx`) means the file can be executed directly, not only via `npm run`.
