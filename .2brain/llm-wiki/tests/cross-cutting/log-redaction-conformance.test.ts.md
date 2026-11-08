---
source: tests/cross-cutting/log-redaction-conformance.test.ts
sha256: 7a6598f0ce3fd09b38304e63174101d20f356055d6908def6b91c0263eb72046
generated_at: 2026-11-08T09:27:49.533821+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/log-redaction-conformance.test.ts

## Purpose

Conformance test that verifies the TypeScript redaction walk answers the same shared YAML case file (`shared/cases/log-redaction.cases.yaml`) identically to the PHP twin. It guards against drift between the two implementations by asserting pass/fail on each key in `shared/rules/log-redaction.yaml`.

## Key elements

- **`redactionCase`** — A Zod schema extending the shared `caseBase` with two fields: `key` (the config key under test) and `expect` (`'redact'` or `'keep'`).
- **`describeCases('log-redaction', redactionCase, …)`** — Iterates every case in the shared YAML file and, for each, calls `redactSensitiveFields({ [key]: 'value' })`, then asserts whether the value survived (`keep`) or was replaced (`redact`).

## Relationships

- **`src/infrastructure/adapters/logger.ts`** — Source of `redactSensitiveFields`, the function under test. This file does not re-implement redaction; it only invokes the adapter and checks the output.
- **`tests/support/cases.ts`** — Provides `caseBase` (shared Zod base schema) and `describeCases` (YAML-driven test runner), which eliminate manual case wiring and keep the TS and PHP suites reading the same YAML fixtures.

## Notes

- The test is intentionally minimal: it constructs a single-key object per case, so it exercises only the key-matching logic, not nested-object traversal.
- The `as Record<string, unknown>` cast is needed because `redactSensitiveFields` returns a more specific type; the cast is safe here since the input is always a flat one-key object.
- To add a new conformance case, edit `shared/cases/log-redaction.cases.yaml` — no changes to this file are required.
