---
source: scripts/scaffold/scaffold-module.ts
sha256: c4a305cc6ece88e3c510bce1994bcba66da9f2a5e8da140f25666466a75e5ab5
generated_at: 2026-10-01T12:40:01.433877+00:00
model: ollama:qwen3.8:27b
---

# scripts/scaffold/scaffold-module.ts

## Purpose

CLI entry point for `npm run scaffold:module -- <name> [options]`. Parses arguments, delegates the actual file-writing to `applyScaffold`, optionally triggers a type-regeneration pass, and prints the list of decisions the tool deliberately leaves to the author. It exists so a new module's folder, docs page, and registry entries can be created in one command rather than by hand.

## Key elements

- **`main(argv)`** – Orchestrates the run: parse args → run `applyScaffold` → (optionally) `spawnSync` `npm run regenerate -- --no-sync` → print `OPEN_DECISIONS` → return exit code.
- **`OPEN_DECISIONS`** – Static array of reminder strings (personal-data flag, role grants, rate limits, frontend counterpart, TODOs) printed after every successful scaffold.
- **`REPO_ROOT`** – Resolved two levels up from `scripts/scaffold/`, passed to `applyScaffold` and used as `cwd` for the regenerate subprocess.
- **Shebang `#!/usr/bin/env tsx`** – The file is a standalone script; it calls `main` immediately and sets `process.exitCode` rather than calling `process.exit()`.

## Relationships

- **`scripts/scaffold/apply.ts`** – Provides `applyScaffold(root, options, formatter)`, the core routine that writes files and registry lines. `scaffold-module.ts` supplies the repo root, parsed options, and a formatter, and reads the resulting `plan` (file list, module names) to log success.
- **`scripts/scaffold/format-text.ts`** – Provides `formatWithRepoConfig`, passed as the `formatter` argument to `applyScaffold` so generated text is prettified with the repo's own config.
- **`scripts/scaffold/options.ts`** – Provides `parseArguments`, `isRefusal`, and `USAGE`. `scaffold-module.ts` uses the first two for CLI validation and prints `USAGE` when the arguments are rejected.

## Notes

- On a failed `applyScaffold` call the error is caught, logged with a `[scaffold] refused:` prefix, and the function returns `1`—it never re-throws.
- The regenerate step is **synchronous** (`spawnSync` with `stdio: 'inherit'`); its non-zero exit code is propagated as the script's exit code.
- `process.exitCode` (not `process.exit()`) is used so pending `console` output is flushed before the process ends.
- The script is invoked via `tsx` (TypeScript executor), not plain Node—do not expect a compiled `.js` twin.
