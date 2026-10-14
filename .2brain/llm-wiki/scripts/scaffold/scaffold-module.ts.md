---
source: scripts/scaffold/scaffold-module.ts
sha256: f58dea90cb6e5b83497913659e6f0b789fe32a25ca845bea86a8860cb9432dc8
generated_at: 2026-10-14T07:31:00.480976+00:00
model: ollama:qwen3.8:27b
---

# scripts/scaffold/scaffold-module.ts

## Purpose

CLI entry point (`npm run scaffold:module -- <name> [options]`) that generates a new module folder, its docs page, and registry lines from a template, then optionally runs `regenerate --no-sync` so generated types exist for the first compile. It delegates the actual file-writing to `applyScaffold` and explicitly prints the decisions it refuses to make on the developer's behalf.

## Key elements

- **`REPO_ROOT`** — Resolved path two levels above `scripts/scaffold/`; passed to `applyScaffold` and used as `cwd` for the regenerate subprocess.
- **`OPEN_DECISIONS`** — Static array of five reminder strings (personal-data flag, role grants, rate limits, frontend pairing, TODOs) printed to stdout after a successful run.
- **`main(argv)`** — Parses CLI args, calls `applyScaffold`, optionally spawns `npm run regenerate -- --no-sync` via `spawnSync`, prints `OPEN_DECISIONS`, and returns a process exit code.
- **Bottom-level `main(...)` invocation** — Top-level call that sets `process.exitCode` from the promise result; an unhandled throw results in exit code 1.

## Relationships

- **`scripts/scaffold/apply.ts`** — Provides `applyScaffold(repoRoot, options, formatter)`, the function that actually writes files and returns a plan (`{ files, names }`). This file is purely the orchestration/CLI layer around it.
- **`scripts/scaffold/format-text.ts`** — Provides `formatWithRepoConfig`, passed as a formatting callback into `applyScaffold` so generated text is formatted consistently with the repo's config.
- **`scripts/scaffold/options.ts`** — Provides `parseArguments`, `isRefusal`, and `USAGE`. This file uses them for argument parsing, early-exit on invalid input, and printing help text on error.

## Notes

- The regenerate step is **synchronous** (`spawnSync`) and only runs when `options.regenerate` is truthy; skip it by omitting the flag.
- Failure of `applyScaffold` is signalled by returning `undefined` (the `.catch` swallows the error and logs it); `main` treats a falsy `plan` as exit 1 rather than rethrowing.
- `OPEN_DECISIONS` is a hard-coded list — it is not derived from the generated files. If the template changes, this list must be updated manually.
- The shebang is `#!/usr/bin/env tsx`; the file is intended to be executed directly, not imported as a library.
