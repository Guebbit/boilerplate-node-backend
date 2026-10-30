---
source: scripts/docs/generate-scenario-registries.ts
sha256: c157e59aaa6063084ea9a2af5ce0d7e1f9cc62cb01ca5e3b5cde64a1e4f1c8c7
generated_at: 2026-10-29T01:35:43.278189+00:00
model: ollama:qwen3.8:27b
---

# scripts/docs/generate-scenario-registries.ts

## Purpose

Executable script (invoked via `npm run regenerate`) that rebuilds the two scenario registries from the on-disk scenario file tree. In `--check` mode it reports drift without writing, which is the path `complete` exercises to verify the registries are in sync.

## Key elements

- **`checkOnly`** — boolean derived from `hasFlag('check')`; selects the drift-report path vs. the write path.
- **Check path** — calls `staleScenarioRegistries(REPO_ROOT, formatWithRepoConfig)`, prints each stale file to stderr with a remediation hint, and exits 1 if any drift was found.
- **Write path** — calls `writeScenarioRegistries(REPO_ROOT, formatWithRepoConfig)`, logs each generated file to stdout, and exits 0.
- **Top-level IIFE-style chain** — both paths return a numeric exit code via `.then(code => process.exitCode = code)`; errors are caught and set exit code to 1.

## Relationships

- **`scripts/cli.ts`** — imports `hasFlag` to detect the `--check` CLI flag.
- **`scripts/modules-on-disk.ts`** — imports `REPO_ROOT` to anchor all filesystem operations to the repository root.
- **`scripts/scaffold/format-text.ts`** — imports `formatWithRepoConfig`, the formatter applied to registry content in both check and write paths.
- **`scripts/scaffold/scenario-registry.ts`** — imports the two core functions: `staleScenarioRegistries` (drift detection) and `writeScenarioRegistries` (regeneration).

## Notes

- Despite living under `scripts/docs/`, this file is a standalone executable (tsx shebang) with no importable exports; it is a side-effect-only entry point.
- In check mode, the stale-file list is printed to **stderr**, while in write mode the generated-file list goes to **stdout** — useful for piping or CI log separation.
- The script sets `process.exitCode` rather than calling `process.exit()`, allowing pending stdout/stderr writes to flush before the process ends.
