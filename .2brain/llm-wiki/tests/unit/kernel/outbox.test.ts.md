---
source: tests/unit/kernel/outbox.test.ts
sha256: 515f6ee9d4adeb21e1718f4406fa08f5d30dd8835f52d6bc15985b7e14294bfb
generated_at: 2026-10-15T13:22:28.529491+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/kernel/outbox.test.ts

## Purpose

Unit tests for the `outboxBackoffMs` retry-schedule function. Ensures the exponential backoff doubles correctly from a 5-second base and never exceeds the one-hour cap.

## Key elements

- **`describe('outboxBackoffMs')`** — single test group; the only block in the file.
- **`it.each([...])('waits %i failure(s) -> %i ms')`** — parameterised check across five (failures, expected-ms) pairs: 1→5000, 2→10 000, 3→20 000, 8→640 000, 10→2 560 000.
- **`it('never waits longer than an hour')`** — asserts the 3 600 000 ms cap holds for failure counts 11 and 500.

## Relationships

- **`src/kernel/outbox.ts`** — the sole dependency. The test imports `outboxBackoffMs` (aliased through the `@kernel` path) and asserts its return values; no other symbols are exercised.

## Notes

- The implicit formula under test is `min(5000 × 2^(n−1), 3_600_000)`. The test cases were chosen to hit both sides of the cap boundary (10 stays under, 11 exceeds).
- Uses `it.each` rather than repeated `it` blocks; keep new boundary cases in the same table to stay consistent.
- No mocking or async helpers — the function under test is pure and synchronous.
