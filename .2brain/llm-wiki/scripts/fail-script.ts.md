---
source: scripts/fail-script.ts
source_sha256: 595849b90e2319360fe87522ed5404462230b236655e474cdd7fe75e4c5cde1b
context_sha256: 2b972aea15de02f4681ccc2c44c984e023382aa4f46cef30325a5ce4d3a70079
generated_at: 2026-11-22T02:06:37.013272+00:00
model: claude-code:claude-sonnet-5-5
---

# scripts/fail-script.ts

## Purpose
A minimal last-resort handler for a script's top-level promise: it logs that the script failed and sets a non-zero exit code. It lives in its own import-free file so that scripts, notably docs generators, can use it without loading the logger, config, or Mongoose the way `run-script.ts` does.

## Key elements
- `failScript(error: unknown): void` is the only export. It calls `console.error('Script failed.', error)` and sets `process.exitCode = 1`. It does not call `process.exit()`.

## Relationships
The neighbors are scripts that use this handler as `main().catch(failScript)` instead of going through `runScript`:
- `scripts/contracts/generate-shared-rule-schemas.ts`
- `scripts/docs/generate-audit-actions.ts`
- `scripts/docs/generate-dependency-map.ts`
- `scripts/docs/generate-jobs.ts`
- `scripts/docs/generate-module-graph.ts`
- `scripts/docs/generate-rate-limit-budgets.ts`
- `scripts/docs/generate-role-matrix.ts`
- `scripts/mutation/run-diff.ts`
- `scripts/mutation/run-shards.ts`
- `scripts/scaffold/demo-remove.ts`
- `scripts/testing/run-prism-smoke-test.ts`

## Notes
- The file has no imports, so keep it that way. That is the reason it exists apart from `run-script.ts`.
- It uses `console.error` rather than the project logger.
- Because it sets `process.exitCode` instead of exiting, the process ends naturally. Pending handles or work can still run before it exits non-zero.
