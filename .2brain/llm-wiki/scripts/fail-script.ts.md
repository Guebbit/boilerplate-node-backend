---
source: scripts/fail-script.ts
sha256: 595849b90e2319360fe87522ed5404462230b236655e474cdd7fe75e4c5cde1b
generated_at: 2026-10-29T01:37:41.867075+00:00
model: ollama:qwen3.8:27b
---

# scripts/fail-script.ts

## Purpose

A zero-dependency, single-export error handler for script entry points. It prints the rejection reason to `stderr` and sets `process.exitCode = 1`. It lives in its own file (no imports) so that lightweight scripts—especially the docs generators—can reference it without pulling in the logger, config, or Mongoose that `run-script.ts` loads.

## Key elements

- **`failScript(error: unknown): void`** (exported) — Logs `'Script failed.'` plus the error via `console.error`, then sets `process.exitCode = 1`. Intended as the `.catch()` handler on a script's top-level promise.

## Relationships

All listed neighbors are scripts that call `main().catch(failScript)` as their last-resort error path, choosing this over the heavier `runScript` wrapper:

- **`scripts/docs/*`** (generate-audit-actions, generate-dependency-map, generate-jobs, generate-module-graph, generate-persona-tables, generate-rate-limit-budgets, generate-role-matrix) — The primary motivation for this file's existence: these generators must stay import-light, so they import `failScript` directly instead of `run-script.ts`.
- **`scripts/contracts/generate-shared-rule-schemas.ts`**, **`scripts/mutation/run-diff.ts`**, **`scripts/mutation/run-shards.ts`**, **`scripts/scaffold/demo-remove.ts`**, **`scripts/testing/run-prism-smoke-test.ts`** — Other scripts that likewise attach `failScript` to their top-level promise.

## Notes

- This file is a `@module` (no side effects on import) and has **zero imports**, making it safe to load in any context (build tools, CI, etc.).
- It does **not** call `process.exit(1)`; it sets `process.exitCode`, allowing pending I/O to flush before the process actually exits.
- Use it only where a script deliberately bypasses `runScript`. If a script already goes through `runScript`, adding `.catch(failScript)` is redundant.
