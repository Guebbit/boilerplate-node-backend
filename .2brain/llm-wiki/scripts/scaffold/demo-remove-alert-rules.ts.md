---
source: scripts/scaffold/demo-remove-alert-rules.ts
sha256: 927130dddec8072962b9e83b71b06ed44e449f6e4b24c23224b8cc112762413d
generated_at: 2026-10-15T09:45:19.618219+00:00
model: ollama:qwen3.8:27b
---

# scripts/scaffold/demo-remove-alert-rules.ts

## Purpose

Removes Prometheus alert rules (and their `promtool` test cases) that reference metrics registered **exclusively** by modules being deleted. It is a text-level editor for `docker/observability/prometheus.alert-rules.yaml` and its companion `.test.yaml`, invoked as part of the scaffold/demo module-removal pipeline.

## Key elements

- **`readRemovedMetrics`** *(exported)* — Walks `src/`, collects every metric name the to-be-removed modules register, then returns only those **not** also registered by surviving code. Must be called before the module folders are deleted.
- **`stripAlertRules`** *(exported)* — Public entry point. Calls `stripRules` then `stripRuleTests`; returns `RemovalNote[]` describing the two file edits, or `[]` when there is nothing to remove.
- **`METRIC_NAME`** (regex) — Matches `name: '<snake_case_with_underscore>'` to pick out metric identifiers while excluding other `name:` literals (module names, queue names).
- **`sourceFiles`** — Recursively collects non-test `.ts` files under a directory.
- **`metricsIn`** — Applies `METRIC_NAME` across a file list and returns the unique metric names found.
- **`splitItems`** — Splits YAML list text into per-item chunks, preserving comment lines that immediately precede each item (lookbehind regex prevents splitting between a comment and its item).
- **`stripRules`** — Filters out rule items whose body references a removed metric, then drops any rule-group header left without a following rule. Writes the result back to the rules file.
- **`stripRuleTests`** — Filters out `promtool` test cases whose `alertname` matches a dropped alert. Writes the result back to the test file.

## Relationships

- **`scripts/scaffold/demo-remove-registry.ts`** — Provides the `RemovalNote` type that `stripAlertRules` returns.
- **`tests/unit/scripts/scaffold/demo-remove-alert-rules.test.ts`** — Unit tests exercising `readRemovedMetrics` and `stripAlertRules`.
- **`tests/unit/scripts/mutation/ci/waves.test.ts`** — CI wave test that exercises the scaffold removal scripts, including this one.
- **`scripts/scaffold/demo-remove-modules.ts`** — Sibling scaffold script in the same removal pipeline; the pipeline orchestrates call ordering so `readRemovedMetrics` runs before folders are deleted.

## Notes

- **Ordering is critical.** `readRemovedMetrics` must execute while the removed module's folders still exist on disk. The docstring references the same ordering convention used by `demo-remove-authorization.ts`.
- **Text edits, not YAML round-trips.** The module deliberately avoids parsing → re-stringifying YAML because a re-stringify would re-wrap every `description` field, producing noisy diffs.
- **Empty-group cleanup.** After dropping rules, a rule-group header (`- name: …`) whose next chunk is no longer a rule is itself removed, so the file stays valid.
- **Underscore heuristic.** The `METRIC_NAME` regex requires at least one underscore in the identifier to distinguish metric names from other `name:` values a module file might contain.
