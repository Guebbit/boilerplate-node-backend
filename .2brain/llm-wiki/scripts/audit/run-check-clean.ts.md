---
source: scripts/audit/run-check-clean.ts
source_sha256: 1440a67f548c8615ebe5ab12c187cc4f34d2a6ed720c150b49398a600850399f
context_sha256: a250385511721c3f3e77eff8d5ffbfb22f01005e85fafea176bfae419aab7834
generated_at: 2026-11-22T01:52:18.412744+00:00
model: claude-code:claude-sonnet-5-5
---

# scripts/audit/run-check-clean.ts

## Purpose
Executable command-line entry point (`#!/usr/bin/env tsx`) for the audit tripwire (rule 6 of the audit rules). It is a thin wrapper that passes command-line arguments to the real logic in `check-clean.ts` and uses the result as the process exit code.

## Key elements
- **Top-level call**: `process.exitCode = main(process.argv.slice(2))`. It imports `main` from `./check-clean` and passes it the arguments after the node and script names.
- **Usage** (via `npm run audit:check-clean --`):
  - `snapshot <run-folder> [--repo <path>...]`
  - `compare <run-folder> [--repo <path>...]`
- **Exit codes**: `0` means clean, `1` means it lists what changed, and `2` means bad usage.

## Relationships
- Depends on `scripts/audit/check-clean.ts`, which exports `main`. That file holds the actual snapshot and compare behavior. This file only wires it to the process arguments and exit code.

## Notes
- The check reports a write after the fact. It does not prevent one.
- The current directory is always audited. `--repo` adds more repositories, such as the paired frontend.
- `main` must return a numeric exit code, because its return value is assigned directly to `process.exitCode`.
