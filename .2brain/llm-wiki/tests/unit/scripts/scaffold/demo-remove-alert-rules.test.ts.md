---
source: tests/unit/scripts/scaffold/demo-remove-alert-rules.test.ts
sha256: de3a3b11104b9302bea053bdcea74aca32a8d699f2b3adc44006f56adb212478
generated_at: 2026-11-08T10:40:45.842323+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scripts/scaffold/demo-remove-alert-rules.test.ts

## Purpose
Unit tests for the `demo-remove-alert-rules` scaffold script. Verifies that `readRemovedMetrics` correctly identifies metrics registered *only* by the modules being removed, and that `stripAlertRules` surgically removes the matching alert rules, emptied rule groups, and their promtool test cases from the Prometheus YAML files while leaving everything else (including comments) intact.

## Key elements
- **`write` / `read`** – small helpers that create/read files under a per-test temp directory (`os.tmpdir()`), avoiding cross-test pollution.
- **`RULES`** – inline Prometheus rule YAML fixture: two groups (`api.rules` with one kept + one dropped alert, `shop.rules` with only a dropped alert) to exercise group-removal and comment-preservation paths.
- **`RULE_TESTS`** – inline promtool `rule_files` test fixture with one `alert_rule_test` entry per alert.
- **`beforeEach`** – scaffolds a throwaway repo root with three `metrics.ts` modules (account, payments, orders), a test-doubles file, and the two YAML fixtures.
- **`afterEach`** – tears down the temp directory with `rmSync`.
- **`describe('readRemovedMetrics')`** – asserts the returned set contains only the metrics unique to the removed modules (`payment_mismatch_total`, `orders_stuck_total`), excluding shared or test-only metrics.
- **`describe('stripAlertRules')`** – two cases: (1) confirms the rules file keeps only `LoginFailures`, drops the emptied `shop.rules` group, preserves the `# Kept:` comment, removes the matching test cases, and returns 2 notes; (2) confirms no-op behavior (empty array, files byte-identical) when no removed metric maps to a rule.

## Relationships
- **`scripts/scaffold/demo-remove-alert-rules.ts`** – the module under test; this file imports `readRemovedMetrics` and `stripAlertRules` directly and asserts on their return values and file-system side effects.
- **`tests/unit/scripts/pairing/spec-identity.test.ts`** – no direct code-level interaction visible in this file; the relationship is purely via the shared dependency graph (both are unit tests under `tests/unit/scripts/`).

## Notes
- Tests mutate real files on disk inside a `mkdtempSync` directory rather than mocking `fs`; the `beforeEach`/`afterEach` lifecycle guarantees isolation.
- The `RULES` fixture intentionally includes a human comment (`# Kept: a foundation counter.`) to guard against a naive YAML round-trip that would strip comments.
- `stripAlertRules` returns an array of "notes" (one per stripped rule). The test asserts `toHaveLength(2)`, coupling the test to the internal note format.
- `auth_login_total` is registered by **both** the account and payments modules; the test verifies it is *not* in the removed set because the non-removed account module still uses it.
