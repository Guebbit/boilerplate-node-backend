---
source: src/modules/account/tests/unit/two-factor-outcomes.test.ts
sha256: ecf8d2730c154a6395dde720a438466425a0f2894985750a1ca28d8652329eab
generated_at: 2026-11-14T19:17:06.957326+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/unit/two-factor-outcomes.test.ts

## Purpose

Unit tests for the `rejectLocked` helper in the two-factor outcomes service. Verifies that the 429 rejection carries the correct error code and that the `retryAfter` value is computed as the remaining lock time (rounded up to whole seconds), with sensible fallbacks, without touching a database.

## Key elements

- **`NOW`** — a fixed `Date` (`2030-01-01T12:00:00.000Z`) passed as the clock so every assertion is exact arithmetic.
- **`userLockedUntil(lockedUntil)`** — builds a minimal `UserDocument` stub (via `asStub`) with only the `mfaLockedUntil` field that `rejectLocked` reads.
- **`waitOf(user)`** — calls `rejectLocked(user, NOW)` and extracts `errors[0].details?.retryAfter` for concise assertions.
- **`describe('rejectLocked')`** — four specs covering: 429 + `RATE_LIMITED` code; rounding-up of remaining seconds; the 1-second floor; and the fallback to `MFA_LOCK_MS / 1000` when the user has no live (or an expired) lock.

## Relationships

- **`src/modules/account/services/two-factor-outcomes.ts`** — source of the `rejectLocked` function under test.
- **`src/modules/account/two-factor/index.ts`** — provides the `MFA_LOCK_MS` constant used in the fallback assertion.
- **`src/modules/users/index.ts`** — re-exports the `UserDocument` type used to type the stub.
- **`src/modules/users/model.ts`** — defines the `UserDocument` shape (consumed indirectly through the index re-export).
- **`tests/support/stub.ts`** — supplies `asStub`, which lets the test pass a partial object where a full model instance is expected.

## Notes

- The test never mocks `Date.now()` or injects a clock factory; it simply passes a fixed `Date` as the second argument, so no `jest.useFakeTimers` or similar is needed.
- Rounding is **up** (ceiling) to whole seconds: 119 001 ms remaining → `120`. The 1-second floor is tested with a 1 ms remainder, not with zero or negative values.
- "No live lock" covers both `undefined` and a `lockedUntil` in the past relative to `NOW`; both must yield the full `MFA_LOCK_MS / 1000` fallback.
