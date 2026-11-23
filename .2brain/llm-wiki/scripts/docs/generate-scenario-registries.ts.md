---
source: scripts/docs/generate-scenario-registries.ts
source_sha256: c157e59aaa6063084ea9a2af5ce0d7e1f9cc62cb01ca5e3b5cde64a1e4f1c8c7
context_sha256: 9c1dbdf221c5073e45ddbe91c5afee91c01936d929c7912f73ab85d07b32d038
generated_at: 2026-11-22T02:04:09.188436+00:00
model: claude-code:claude-sonnet-5-5
---

# scripts/docs/generate-scenario-registries.ts

## Purpose
A small `tsx` CLI script behind `npm run regenerate`. It rebuilds the two scenario registries from the file tree, using the logic in `scripts/scaffold/scenario-registry.ts`. With `--check` it only reports drift instead of writing; this is the mode that `complete` runs.

## Key elements
- `checkOnly`: boolean from `hasFlag('check')`. It selects between the two modes.
- Check mode: calls `staleScenarioRegistries(REPO_ROOT, formatWithRepoConfig)`. It prints each stale file to stderr with the hint `Run: npm run regenerate`. It resolves to exit code `1` if any are stale, otherwise `0`.
- Write mode: calls `writeScenarioRegistries(REPO_ROOT, formatWithRepoConfig)`. It logs `✓ Generated <file>` for each written file and resolves to `0`.
- Final chain: sets `process.exitCode` to the resolved code. Any rejection is logged with `console.error` and sets `process.exitCode = 1`.

The file has no exports. It runs on import and is meant to be executed directly.

## Relationships
- `scripts/scaffold/scenario-registry.ts`: provides `staleScenarioRegistries` and `writeScenarioRegistries`, which do the actual generation and drift detection.
- `scripts/scaffold/format-text.ts`: provides `formatWithRepoConfig`. It is passed to both functions as the formatter.
- `scripts/modules-on-disk.ts`: provides `REPO_ROOT`, the root passed to the registry functions.
- `scripts/cli.ts`: provides `hasFlag`, used to read `--check`.

## Notes
- The script sets `process.exitCode` rather than calling `process.exit()`, so pending output can flush.
- Check mode never writes files, so it is safe to run in CI or validation steps.
