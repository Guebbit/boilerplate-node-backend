---
source: scripts/scaffold/demo-remove-alert-rules.ts
source_sha256: 88069d1d1681394de1c96f691fa40a2cc08b9af0eebacf8b0e46fc93245a2293
context_sha256: e7e8b2f65a2aa569c1c0033a7f75461f16d7e08c652a21df9c165fa988dcb46b
generated_at: 2026-11-22T02:14:09.675286+00:00
model: claude-code:claude-sonnet-5-5
---

# scripts/scaffold/demo-remove-alert-rules.ts

## Purpose
When demo modules are removed from the project, this file removes the Prometheus alert rules that watch those modules' own metrics. It also removes the matching `promtool` test cases. It edits `docker/observability/prometheus.alert-rules.yaml` and `prometheus.alert-rules.test.yaml` as text, not through a YAML parse and re-stringify, because a round trip would re-wrap every description.

## Key elements
- `readRemovedMetrics(repoRoot, names)` — exported. Scans every non-test `.ts` file under `src/` (it skips `tests` directories) for `name: '<snake_case_metric>'` literals. It returns the metrics registered only by files under the removed modules' folders (`src/modules/<name>/`), never by surviving code. It must run before the folders are deleted.
- `stripAlertRules(repoRoot, metrics)` — exported. Does nothing and returns `[]` if there are no metrics or no matching alerts. Otherwise it strips the rules, then their test cases, and returns two `RemovalNote`s, one per file, listing the removed alert names.
- `stripRules` (internal) — splits the rules file into items and drops each `alert` item whose text mentions a removed metric as a whole word. It then drops any group header left with no rule after it, and returns the dropped alert names.
- `stripRuleTests` (internal) — splits the test file on `interval` items and drops every chunk with an `alertname:` matching a dropped alert.
- `splitItems` — a regex split of a YAML list into items. Each item keeps the comment lines directly above it.
- `METRIC_NAME` — the regex that matches metric registrations. It requires an underscore in the name, which excludes a module's own name and queue names.

## Relationships
- Imports the `RemovalNote` type from `demo-remove-registry.ts`, which is the shape of the notes it returns.
- `demo-remove-modules.ts` is a graph neighbor, but no code in this file imports it and this file shows no direct interaction with it.
- Unit tests are in `tests/unit/scripts/scaffold/demo-remove-alert-rules.test.ts`. `tests/unit/scripts/mutation/ci/waves.test.ts` is also a graph neighbor, but this file shows no direct interaction with it.

## Notes
- `readRemovedMetrics` must run before the module folders are deleted, since ownership is read from the code.
- Ownership is inferred from the code. A metric counts as removed only if no surviving file registers it, so a metric shared with a kept module is left alone.
- `splitItems` uses a lookbehind so it never splits between a comment and the item below it.
- A group header is kept only if the chunk after it is an alert. A group followed by anything else is treated as empty and dropped.
