---
source: tests/unit/scripts/scaffold/demo-remove-alert-rules.test.ts
sha256: de3a3b11104b9302bea053bdcea74aca32a8d699f2b3adc44006f56adb212478
generated_at: 2026-10-15T13:30:20.937698+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scripts/scaffold/demo-remove-alert-rules.test.ts

## Purpose

Unit tests for the `readRemovedMetrics` and `stripAlertRules` helpers in `scripts/scaffold/demo-remove-alert-rules.ts`. They verify that, given a repo with multiple modules, the scaffold correctly identifies metrics registered *only* by removed modules and then strips the corresponding Prometheus alert rules, their enclosing groups (when emptied), and their promtool test cases from the on-disk YAML files.

## Key elements

- **`write` / `read` helpers** — create and read files under a per-test temp root; `write` recursively creates parent directories.
- **`RULES`** — fixture YAML for `prometheus.alert-rules.yaml`: two groups (`api.rules` with one kept + one dropped alert; `shop.rules` with a single dropped alert).
- **`RULE_TESTS`** — fixture YAML for `prometheus.alert-rules.test.yaml`: one promtool `alert_rule_test` block per alert.
- **`beforeEach`** — builds a throwaway repo tree (three metric modules, a test-doubles file, and the two observability YAML files) inside `os.tmpdir()`.
- **`afterEach`** — removes the temp tree.
- **`describe('readRemovedMetrics')`** — asserts that only metrics exclusive to the removed module set (`payments`, `orders`) are returned; metrics shared with remaining modules (`auth_login_total`) are excluded.
- **`describe('stripAlertRules')`** — asserts the stripped YAML keeps only non-removed alerts, removes fully-emptied groups, removes matching promtool cases, preserves relevant comments, and returns a `notes` array (length 2 = two alerts removed). A second case confirms both files are byte-identical when the removed-metric set has no corresponding rule.

## Relationships

- **`scripts/scaffold/demo-remove-alert-rules.ts`** — the module under test; the test imports `readRemovedMetrics` and `stripAlertRules` directly.

## Notes

- Tests operate on a **real filesystem** (temp directory), not a mocked `fs`; cleanup relies on `afterEach` calling `rmSync` with `recursive: true, force: true`.
- The fixture repo layout mirrors a multi-module monorepo (`src/modules/<name>/metrics.ts`); the `doubles.ts` file under `src/modules/orders/tests/` exists specifically to be *excluded* by `readRemovedMetrics` (test files are ignored).
- `stripAlertRules` mutates files in place and also returns a `notes` array summarising what was removed; the tests check both the file contents *and* the notes length.
- YAML comment lines (`# Kept:`, `# Dropped:`) are used as a proxy for verifying that the function removes rule blocks wholesale rather than doing a naive string replace.
