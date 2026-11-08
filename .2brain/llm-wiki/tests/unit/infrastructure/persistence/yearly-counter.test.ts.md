---
source: tests/unit/infrastructure/persistence/yearly-counter.test.ts
sha256: 99dff3f2178815f63584bc15654979e8ecb6c6f21ca718e190c488bf9328747a
generated_at: 2026-11-08T10:23:02.234624+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/persistence/yearly-counter.test.ts

## Purpose

Unit tests for the pure formatting helper `formatYearlySequence`. This file verifies the *printed representation* of a yearly number (year, dash, zero-padded sequence). The actual atomic increment logic is deliberately excluded here and is instead exercised against a real database by the order and invoice numbering integration suites.

## Key elements

- **`describe('formatYearlySequence')`** — single test block scoped to the imported function.
  - *Case 1*: asserts `formatYearlySequence(2026, 41)` → `"2026-000041"` (six-digit zero-padding).
  - *Case 2*: asserts `formatYearlySequence(2026, 1_234_567)` → `"2026-1234567"` (no truncation when the sequence exceeds six digits).

## Relationships

- **`src/infrastructure/persistence/yearly-counter.ts`** — the sole import (`formatYearlySequence` via the `@infrastructure/persistence/yearly-counter` alias). This test file is the only consumer in the unit-test layer; the integration suites (order/invoice numbering) test the increment behavior of the same module but are not listed here as a direct import.

## Notes

- The file-header comment explicitly documents the split of responsibility: this suite covers formatting only; correctness of the increment (race conditions, DB constraints) is proven elsewhere against a live database.
- The import uses the project-wide `@infrastructure/…` path alias rather than a relative path, matching the convention in other unit tests.
