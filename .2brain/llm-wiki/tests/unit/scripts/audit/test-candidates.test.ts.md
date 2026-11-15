---
source: tests/unit/scripts/audit/test-candidates.test.ts
sha256: 36999a73430b827887f5fd2d2e1a74e558aec09371087603aa442bb60bfe13b2
generated_at: 2026-11-15T00:25:25.094455+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scripts/audit/test-candidates.test.ts

## Purpose

Unit test for the **test-honesty** ESLint candidate rule (`eslint.candidates.config.ts`). It verifies that the rule flags test blocks whose assertions are *all* weak (e.g. `toBeDefined`, `toBe`, a lone `rejects.toThrow`) with a warning, while leaving tests that contain at least one "real" assertion untouched. The rule is a *candidate*—it is linted in CI but not yet enforced as a hard gate.

## Key elements

- **`linter`** – `eslint` `Linter` instance created with `configType: 'flat'`, used for programmatic in-memory linting.
- **`weakOnlyTests(code)`** – Helper that runs the candidates config against a single inline snippet (`'sample.test.ts'`) and returns the count of messages at `severity === 1` (warning).
- **`describe('test-honesty candidates config')`** – Two `it.each` blocks:
  - *"leaves a test with a real assertion alone"* – three snippets that mix a weak and a real assertion; expects `0` warnings.
  - *"lists a test whose only assertion is weak"* – three snippets where every assertion is weak; expects exactly `1` warning.

## Relationships

- **`scripts/audit/test-honesty/eslint.candidates.config.ts`** – Imported as the default-exported flat-config object; the entire test suite exercises this config's detection logic. No other project files are touched.
- **`eslint` (npm package)** – Provides the `Linter` class used for verification.

## Notes

- Weakness is signalled at **severity 1 (warning)**, not 2 (error). Any future change to the config that escalates severity will break the `=== 1` filter here.
- Test inputs are **inline template-literal strings**, not fixture files; they pass through `linter.verify` with the virtual filename `'sample.test.ts'`.
- The JSDoc at the top of the file describes the *config under test*, not this test file itself—a quick read can be misleading.
- The rule is explicitly "the one cut the lint gate does not make," meaning it is advisory/candidate status, not a blocking rule.
