---
source: tests/unit/infrastructure/http/middlewares/store-breaker.test.ts
sha256: 689f0264aa0862409965fa6e12ba541e7d10f5798623b98ab0d105c395a8a33c
generated_at: 2026-11-08T10:17:01.282172+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/http/middlewares/store-breaker.test.ts

## Purpose
Unit tests for the `createBreaker` circuit breaker that guards the limits-Redis store. The breaker is exercised with a manually-advanced clock so no test depends on real elapsed time.

## Key elements
- **`breakerWithClock()`** — local helper that creates a `createBreaker(30_000, () => time)` instance alongside an `advance(ms)` closure for stepping the injected clock.
- **`createBreaker(window, clock)`** (imported) — the SUT. Exposes `admit()`, `failed()`, and `succeeded()` on the returned object.
- **`describe('createBreaker')`** block — five scenarios covering the full state machine:
  - *Closed*: every `admit()` returns `true`.
  - *Open*: after `failed()`, `admit()` returns `false` for the entire 30 s window (verified at 29 999 ms).
  - *Half-open*: once the window expires, exactly **one** `admit()` returns `true`; subsequent calls return `false`.
  - *Close after successful probe*: `admit()` → `succeeded()` → all subsequent `admit()` return `true`.
  - *Re-open after failed probe*: `admit()` → `failed()` → a **new full window** begins (false at 29 999 ms, true again at 30 000 ms).

## Relationships
- **`src/infrastructure/http/middlewares/store-breaker.ts`** — the module under test; this file imports `createBreaker` from it and validates its state transitions (closed → open → half-open → closed/open).

## Notes
- The half-open state is intentionally restrictive: only the **first** `admit()` after the window expires is allowed through; further calls in the same tick are refused. This is a deliberate design choice (single probe), not a bug.
- The clock is a simple mutable closure (`let time`), so the tests are fully deterministic and synchronous — no `jest.useFakeTimers()` or `await` needed.
- The 1 ms boundary check in the re-open test (`advance(1)` → `true`) confirms the window is **inclusive** at exactly `window` ms, not `< window`.
