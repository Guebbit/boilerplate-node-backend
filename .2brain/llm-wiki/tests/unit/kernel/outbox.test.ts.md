---
source: tests/unit/kernel/outbox.test.ts
sha256: 515f6ee9d4adeb21e1718f4406fa08f5d30dd8835f52d6bc15985b7e14294bfb
generated_at: 2026-11-08T10:27:33.587206+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/kernel/outbox.test.ts

## Purpose

Unit tests for the `outboxBackoffMs` retry-scheduling function, verifying its exponential-doubling sequence (5 s base) and its hard cap at one hour. Exists to lock in the exact millisecond values so that any unintended change to the backoff curve is caught immediately.

## Key elements

- **`describe('outboxBackoffMs')`** — the sole test suite; contains two test cases.
- **`it.each([...])('waits %i failure(s) -> %i ms', …)`** — parameterized table checking specific failure counts (1, 2, 3, 8, 10) against their expected delays (5 000 → 2 560 000 ms).
- **`it('never waits longer than an hour')`** — asserts the cap: both `outboxBackoffMs(11)` and `outboxBackoffMs(500)` return `3 600 000`.

## Relationships

- **`src/kernel/outbox.ts`** — sole import source. The test imports `outboxBackoffMs` via the `@kernel/outbox` alias and exercises it as a pure function (input: failure count → output: delay in ms). No other modules are referenced.

## Notes

- The formula under test is `min(5000 × 2^(failures − 1), 3_600_000)`. The parameterized cases were chosen to cover early values, a mid-range doubling step (failure 8), and a value just before the cap (failure 10 = 2 560 000 < 3 600 000).
- The cap boundary is at failure 11 (5 000 × 2¹⁰ = 5 120 000 → clamped to 3 600 000). Testing failure 500 confirms the clamp is stable for arbitrarily large inputs.
- No mocks, fixtures, or async logic are involved; the tests are fully synchronous.
