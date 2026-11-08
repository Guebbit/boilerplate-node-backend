---
source: scripts/scaffold/scaffold-module.ts
sha256: 52f222edf2e6656d2a9f8f8e926945e33f90c531faa4fecea8cb99adcdcb81a8
generated_at: 2026-11-08T03:00:37.810177+00:00
model: ollama:qwen3.8:27b
---

# scripts/scaffold/scaffold-module.ts

## Purpose

CLI entry point for `npm run scaffold:module -- <name> [options]`. It parses arguments, delegates the actual file generation to the apply step, optionally triggers type regeneration, and prints a fixed list of decisions the author must still make. It deliberately does **not** choose personal-data flags, role grants, or rate limits for the new module.

## Key elements

- **`OPEN_DECISIONS`** — Hardcoded array of four reminder strings (personal data, roles, rate limits, TODOs) printed after a successful scaffold run.
- **`main(argv)`** — Orchestrates the run: validates args via `parseArguments`/`isRefusal`, calls `applyScaffold`, conditionally spawns `npm run regenerate --no-sync` via `spawnSync`, prints the open decisions, and returns a numeric exit code.
- **Top-level invocation** — `main(process.argv.slice(2)).then(...)` runs immediately at import; the promise's resolved value becomes `process.exitCode`, a rejection sets it to 1.

## Relationships

- **`scripts/scaffold/options.ts`** — Supplies `parseArguments`, `isRefusal`, and `USAGE` for CLI arg handling and refusal messaging.
- **`scripts/scaffold/apply.ts`** — Supplies `applyScaffold`, which performs the actual file writes, doc-page generation, and registry registration; this file passes it the resolved `REPO_ROOT`, parsed options, and a formatter.
- **`scripts/scaffold/format-text.ts`** — Supplies `formatWithRepoConfig`, handed to `applyScaffold` as the text-formatting callback for generated content.
- **`scripts/modules-on-disk.ts`** — Supplies `REPO_ROOT`, the absolute path to the repository root used as the working directory for both the scaffold and the `spawnSync` regenerate call.

## Notes

- The shebang is `#!/usr/bin/env tsx`; the file is intended to be executed directly by `tsx`, not transpiled first.
- `main` is called unconditionally at module load (top-level). There is no `if (require.main === module)` guard, so importing this file will execute the scaffold.
- The `regenerate` step is **optional** — it only runs when `options.regenerate` is truthy.
- `applyScaffold` errors are caught and re-surfaced as a single-line refusal message; the stack trace is not printed.
- `spawnSync` with `stdio: 'inherit'` means the regenerate output goes straight to the terminal; there is no captured output to inspect programmatically.
