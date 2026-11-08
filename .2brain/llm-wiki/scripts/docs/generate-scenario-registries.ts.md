---
source: scripts/docs/generate-scenario-registries.ts
sha256: c157e59aaa6063084ea9a2af5ce0d7e1f9cc62cb01ca5e3b5cde64a1e4f1c8c7
generated_at: 2026-11-08T02:48:46.851106+00:00
model: ollama:qwen3.8:27b
---

# scripts/docs/generate-scenario-registries.ts

## Purpose

CLI entry point (run via `npm run regenerate`) that rebuilds the two scenario registries from the on-disk file tree. Supports a `--check` mode that reports drift without writing, which is the mode `complete` invokes to verify registries are in sync.

## Key elements

- **`checkOnly`** — boolean derived from `hasFlag('check')`; selects between the two code paths.
- **Check path** — calls `staleScenarioRegistries(REPO_ROOT, formatWithRepoConfig)`, prints each drifted file to stderr with a remediation hint, and exits `1` if any file is stale (else `0`).
- **Write path** — calls `writeScenarioRegistries(REPO_ROOT, formatWithRepoConfig)`, logs each generated file to stdout, and exits `0`.
- **Top-level promise chain** — sets `process.exitCode` from the resolved code; catches any thrown error, logs it, and exits `1`.

## Relationships

- **`scripts/cli.ts`** — imports `hasFlag` to detect the `--check` flag.
- **`scripts/modules-on-disk.ts`** — imports `REPO_ROOT` as the base directory for both check and write operations.
- **`scripts/scaffold/format-text.ts`** — imports `formatWithRepoConfig`, passed as the formatting function into the registry helpers.
- **`scripts/scaffold/scenario-registry.ts`** — imports `staleScenarioRegistries` (drift detection) and `writeScenarioRegistries` (regeneration); this file contains the actual registry logic this script orchestrates.

## Notes

- The script has no exported API; it is a side-effect-only entry point (shebang `#!/usr/bin/env tsx`).
- `--check` mode intentionally writes nothing — it is safe to run in CI or as a pre-commit guard.
- Exit code semantics: `0` = in sync / regenerated successfully; `1` = drift found or runtime error.
