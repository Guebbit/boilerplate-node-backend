---
source: tests/cross-cutting/log-redaction-conformance.test.ts
sha256: 167ee253d21e3b524ccefa0667292fdf11f4e10d3b7dfdcfeff3377803467495
generated_at: 2026-10-29T06:46:58.731569+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/log-redaction-conformance.test.ts

## Purpose

Cross-cutting conformance test that verifies the TypeScript `redactSensitiveFields` implementation produces identical results to the PHP twin, using a shared YAML case set (`shared/cases/log-redaction.cases.yaml`). It ensures both language repositories agree on which log keys are sensitive, keeping the redaction policy single-sourced.

## Key elements

- **`redactionCase`** – Zod schema (extends `caseBase`) defining each test case: a non-empty `key` string and an `expect` enum (`'redact' | 'keep'`).
- **`describeCases('log-redaction', redactionCase, 14, …)`** – Registers 14 parameterised test cases. For each case it calls `redactSensitiveFields({ [key]: 'value' })` and asserts the resulting value is either still `'value'` (keep) or has been replaced (redact), matching the expected outcome.

## Relationships

- **`src/infrastructure/adapters/logger.ts`** – Source of `redactSensitiveFields`, the function under test. This test is the primary conformance gate for that function's key-matching logic.
- **`tests/support/cases.ts`** – Provides `caseBase` (shared zod base fields like `id`/`description`) and `describeCases` (loader that reads the shared YAML case file and drives Vitest). This test file is a consumer of both.

## Notes

- The 14-case count is hard-coded in the `describeCases` call; if the shared YAML gains or loses entries, this number must be updated or the test suite will fail at load time.
- The test only checks a single-object shape (`{ [key]: 'value' }`). It does **not** exercise nested objects, arrays, or multiple keys in one payload—those paths (if they exist) in `redactSensitiveFields` are unverified here.
- The YAML rule list (`shared/rules/log-redaction.yaml`) is read by the redaction code itself, not directly by this test; the test only supplies key names and expected outcomes.
