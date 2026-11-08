---
source: scripts/fail-script.ts
sha256: 595849b90e2319360fe87522ed5404462230b236655e474cdd7fe75e4c5cde1b
generated_at: 2026-11-08T02:51:17.827377+00:00
model: ollama:qwen3.8:27b
---

# scripts/fail-script.ts

## Purpose

A zero-dependency error handler that reports a script's uncaught failure and sets a non-zero exit code. It exists as a lightweight alternative to `runScript` for scripts (especially docs generators) that must not pull in the logger, config, or Mongoose at module load time.

## Key elements

- **`failScript(error: unknown): void`** — The sole export. Logs `"Script failed."` plus the error via `console.error`, then sets `process.exitCode = 1`. Intended to be used as a `.catch()` handler on a script's top-level promise (e.g. `main().catch(failScript)`).

## Relationships

- **Docs generators** (`scripts/docs/generate-audit-actions.ts`, `generate-cookie-table.ts`, `generate-dependency-map.ts`, `generate-jobs.ts`, `generate-module-graph.ts`, `generate-persona-tables.ts`, `generate-rate-limit-budgets.ts`, `generate-role-matrix.ts`) and **`scripts/contracts/generate-shared-rule-schemas.ts`** are the primary consumers: they import `failScript` instead of the heavier `runScript` path to keep their dependency surface minimal.
- Other scripts (`scripts/mutation/run-diff.ts`, `run-shards.ts`, `scripts/scaffold/demo-remove.ts`, `scripts/testing/run-prism-smoke-test.ts`) may also use it when they skip `runScript` but still need a uniform failure signal.

## Notes

- Deliberately has **no imports**. Adding one would defeat the file's purpose (isolating the failure path from application-level dependencies).
- It sets `process.exitCode` rather than calling `process.exit()`, allowing pending I/O and event-loop work to drain before the process actually exits.
- Because it uses `console.error` (not the project logger), log output format will differ from scripts that go through `runScript`.
