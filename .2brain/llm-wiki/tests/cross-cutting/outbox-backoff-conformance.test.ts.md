---
source: tests/cross-cutting/outbox-backoff-conformance.test.ts
sha256: 889faac3b5f2b0542d3bb1982ca43d23d75ff3a2fb6ea53b7741fc819e827582
generated_at: 2026-11-08T09:29:04.701449+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/outbox-backoff-conformance.test.ts

## Purpose
Cross-language conformance test that asserts the TypeScript `outboxBackoffMs` function returns the same delay values as the PHP twin. It loads a shared YAML case file (`shared/cases/outbox-backoff.cases.yaml`) and checks each case's expected `delayMs` against the live implementation, ensuring both implementations stay in lockstep.

## Key elements
- **`backoffCase`** — Zod schema extending `caseBase` with two fields: `failedAttempts` (positive int) and `delayMs` (positive int). Describes one input/output pair for the backoff function.
- **`describeCases('outbox-backoff', backoffCase, …)`** — Test runner that reads the shared cases, validates them against `backoffCase`, and for each case asserts `outboxBackoffMs(failedAttempts) === delayMs`.

## Relationships
- **`src/kernel/outbox.ts`** — Source of `outboxBackoffMs`, the function under test. This test is its primary behavioral spec.
- **`tests/support/cases.ts`** — Provides `caseBase` (base Zod fields shared across all case schemas) and `describeCases` (the runner that loads the YAML file, validates, and executes the assertion callback).

## Notes
- The case data lives in `shared/cases/outbox-backoff.cases.yaml`; adding a new backoff scenario means editing that YAML, not this file. The test name `'outbox-backoff'` is the key that maps to the YAML file name.
- Both `failedAttempts` and `delayMs` are constrained to positive integers — zero or negative values will fail schema validation before the assertion ever runs.
