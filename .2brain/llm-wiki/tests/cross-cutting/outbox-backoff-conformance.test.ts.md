---
source: tests/cross-cutting/outbox-backoff-conformance.test.ts
sha256: 1f0f9767927bce21e4f35c2be48c927dd6766d9e225fa5fda89e9ace1015e89d
generated_at: 2026-10-29T06:47:34.843491+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/outbox-backoff-conformance.test.ts

## Purpose

Conformance test that verifies `outboxBackoffMs` in the TypeScript kernel produces the same delay values as the PHP twin's outbox relay. It runs a fixed set of 7 shared cases (sourced from `shared/cases/outbox-backoff.cases.yaml`) to lock in cross-language parity for the exponential/linear backoff schedule.

## Key elements

- **`backoffCase`** — Zod schema extending `caseBase` with two required integer fields: `failedAttempts` (positive) and `delayMs` (positive). Describes one row of the shared case file.
- **`describeCases('outbox-backoff', backoffCase, 7, …)`** — Declarative case-runner (from `@tests/cases`) that loads 7 YAML cases, validates them against `backoffCase`, and asserts `outboxBackoffMs(failedAttempts) === delayMs` for each.

## Relationships

- **`src/kernel/outbox.ts`** — Source of the SUT: `outboxBackoffMs(failedAttempts: number): number`. This test is its behavioral contract.
- **`tests/support/cases.ts`** — Provides `caseBase` (common case-envelope fields) and `describeCases` (the runner that loads, validates, and iterates the shared YAML file).

## Notes

- The case file lives outside the repo's `tests/` tree (`shared/cases/outbox-backoff.cases.yaml`), meaning the PHP and TS codebases share the same fixture. Adding or editing a case there affects both languages simultaneously.
- The count `7` is passed explicitly to `describeCases`; if the YAML gains a row, this number must be updated in lockstep or the runner will silently skip new cases.
- `backoffCase` extends `caseBase` rather than defining a standalone schema, so any fields added to the shared case envelope (e.g., a `description` or `tags` field) are automatically picked up without touching this file.
