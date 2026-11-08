---
source: shared/cases/outbox-backoff.cases.yaml
sha256: a3309ec76ddde7f812c3907979db928753b80cf11b1adefd38a402060a884b40
generated_at: 2026-11-08T03:05:46.038544+00:00
model: ollama:qwen3.8:27b
---

# shared/cases/outbox-backoff.cases.yaml

## Purpose

Test-case table that pins down the expected exponential-backoff delay for the outbox dispatch retry logic. It exists so that any implementation of the backoff function can be verified against a single, human-readable set of (attempt → delay) pairs covering base delay, doubling progression, the 1-hour cap, and extreme-overflow edge cases.

## Key elements

- **`cases`** — A list of objects, each with:
  - `name` — human-readable description of the scenario.
  - `failedAttempts` — 1-based attempt number that has just failed.
  - `delayMs` — the expected delay in milliseconds before the next retry.

Covered scenarios:

- Base delay (attempt 1 → 5 000 ms).
- Doubling on attempts 2 and 3 (10 000, 20 000 ms).
- Large-but-uncapped exponent (attempt 10 → 2 560 000 ms).
- Cap enforcement (attempt 11 → 3 600 000 ms; attempt 100 → 3 600 000 ms).
- Numeric-overflow guard (attempt 2000 → 3 600 000 ms; exponent large enough to overflow a float must still clamp to the cap).

## Relationships

No graph neighbors. This file is a standalone test-data fixture; it does not import or export code.

## Notes

- **1-based indexing**: `failedAttempts: 1` means "this is the first failure." The delay formula is `min(5000 × 2^(n-1), 3600000)` where `n = failedAttempts`. Off-by-one errors are the most likely consumer bug.
- **No jitter** is applied or expected. Any implementation that adds randomization will fail these cases.
- **Cap is inclusive**: the cap value (3 600 000 ms = 1 h) is the maximum; the 11th attempt would mathematically be 5 120 000 but is clamped down.
- The overflow case (`failedAttempts: 2000`) guards against `2^1999` blowing past `Number.MAX_SAFE_INTEGER` (or equivalent) in the consuming language. Implementations must check the cap *before* computing the exponent, or use a saturating arithmetic path.
