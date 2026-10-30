---
source: scripts/scaffold/scaffold-module.ts
sha256: af28a8f1d10fae3c3cde59ceb6895039a595d146b4b8e6f34cd374e32aa6b6cb
generated_at: 2026-10-29T01:43:46.341099+00:00
model: ollama:qwen3.8:27b
---

# scripts/scaffold/scaffold-module.ts

## Purpose

CLI entry point for `npm run scaffold:module`. It parses the author-supplied module name and options, delegates the actual file/registry writing to the apply layer, optionally triggers a type-regeneration pass, and prints the list of decisions it deliberately does not make on the author's behalf.

## Key elements

- **`main(argv)`** – Async orchestration: parses args → calls `applyScaffold` → (if `--regenerate`) runs `npm run regenerate -- --no-sync` via `spawnSync` → prints open decisions → returns an exit code.
- **`OPEN_DECISIONS`** – Five human-readable strings (personal-data flag, role grants, rate limits, frontend counterpart, TODOs) printed after every successful run to remind the author what still needs manual attention.
- **Bottom IIFE** – Invokes `main(process.argv.slice(2))`, maps the resolved code to `process.exitCode`, and catches unhandled rejections (exits 1).

## Relationships

- **`scripts/scaffold/apply.ts`** – Provides `applyScaffold`, the function that actually creates the module folder, docs page, and registry lines. This file is its only caller.
- **`scripts/scaffold/format-text.ts`** – Provides `formatWithRepoConfig`, passed as the formatter argument into `applyScaffold` so generated files are formatted with the repo's Prettier config.
- **`scripts/scaffold/options.ts`** – Provides `parseArguments`, `isRefusal`, and `USAGE` for CLI arg handling and error messaging.
- **`scripts/modules-on-disk.ts`** – Provides `REPO_ROOT`, used as the working directory for both the scaffold write and the `spawnSync` regenerate call.

## Notes

- Run via `tsx` (shebang line); not compiled into the package's dist output.
- The regenerate step passes `--no-sync` deliberately: it produces local types for the first `tsc` pass without pushing anything to a remote registry.
- Exit is set through `process.exitCode` (not `process.exit`) so buffered stdout/stderr from the child `regenerate` process can flush before the process terminates.
- The scaffolder intentionally does **not** infer personal-data classification, role assignments, rate-limit budgets, or a frontend module name — these are surfaced as post-run reminders rather than guessed.
