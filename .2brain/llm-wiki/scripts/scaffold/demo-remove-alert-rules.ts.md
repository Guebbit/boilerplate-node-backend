---
source: scripts/scaffold/demo-remove-alert-rules.ts
sha256: 927130dddec8072962b9e83b71b06ed44e449f6e4b24c23224b8cc112762413d
generated_at: 2026-11-08T02:58:00.213442+00:00
model: ollama:qwen3.8:27b
---

# scripts/scaffold/demo-remove-alert-rules.ts

## Purpose

Removes Prometheus alert rules (and their `promtool` test cases) that monitor metrics owned exclusively by modules being deleted. It identifies "orphan" metrics by diffing what the removed folders register versus what the surviving codebase registers, then performs surgical text edits on the two YAML files under `docker/observability/`. It is a step in the scaffold module-removal pipeline.

## Key elements

- **`readRemovedMetrics(repoRoot, names)`** *(exported)* — Walks `src/` (skipping `tests/` dirs), collects every metric name each folder registers via the `METRIC_NAME` regex, and returns only those metrics that appear in the removed folders **and not** anywhere else. Must be called **before** the folders are deleted.
- **`stripAlertRules(repoRoot, metrics)`** *(exported)* — Public entry point. Calls the internal `stripRules` + `stripRuleTests`, then returns a `RemovalNote[]` describing both edited files. No-ops (returns `[]`) when no metrics or no alerts match.
- **`METRIC_NAME`** — Global regex (`name:\s*'([a-z][a-z0-9]*_[a-z0-9_]+)'`) that distinguishes metric names from other `name:` literals (module names, queue names) by requiring an underscore.
- **`splitItems(content, keys)`** — Splits a YAML list into item chunks, preserving comment lines that directly precede each item (uses a lookbehind to avoid splitting between a comment and its item).
- **`stripRules`** / **`stripRuleTests`** — Internal helpers that filter chunks and `writeFileSync` the result. `stripRules` also drops any group header left without a following rule.
- **`sourceFiles`** / **`metricsIn`** — Small utilities: recursive `.ts` file collection (excluding `tests/`) and metric-name extraction from a file list.

## Relationships

- **`scripts/scaffold/demo-remove-registry.ts`** — Imports the `RemovalNote` type used as the return type of `stripAlertRules`.
- **`scripts/scaffold/demo-remove-modules.ts`** — Sibling in the same scaffold removal pipeline; the pipeline orchestrator invokes `readRemovedMetrics` and `stripAlertRules` as part of the removal sequence.
- **`tests/unit/scripts/scaffold/demo-remove-alert-rules.test.ts`** — Unit tests exercising `readRemovedMetrics`, `stripAlertRules`, and the internal splitting/stripping logic.
- **`tests/unit/scripts/mutation/ci/waves.test.ts`** — CI-wave integration test that includes this script's mutation as one of the waves under test.

## Notes

- Edits are **text-based** (split/filter/join), deliberately avoiding a YAML parse→stringify round-trip that would re-wrap every description line.
- `readRemovedMetrics` must run **before** the module folders are deleted (the doc block and the `demo-remove-authorization.ts` ordering guarantee this). Calling it after deletion would find nothing.
- The `sourceFiles` helper skips any directory literally named `tests`, so co-located test files never influence the "surviving" metric set.
- `splitItems` relies on a variable-length lookbehind regex (`(?<!^[ \t]*#[^\n]*)`); this is supported in V8/modern Node but will break on older runtimes.
- The regex in `stripRules` that checks whether a chunk "reads" a metric is built per-metric with `\b` word boundaries — metric names containing only `[a-z0-9_]` are safe, but this would not survive a metric name with special characters (none exist today).
