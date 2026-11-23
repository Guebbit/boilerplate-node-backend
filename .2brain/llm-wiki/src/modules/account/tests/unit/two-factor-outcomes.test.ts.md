---
source: src/modules/account/tests/unit/two-factor-outcomes.test.ts
source_sha256: ecf8d2730c154a6395dde720a438466425a0f2894985750a1ca28d8652329eab
context_sha256: ce80c53e52b78a79debc721613c6655c68c3647728b954ac065602e54513f0d0
generated_at: 2026-11-22T04:09:43.187312+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/tests/unit/two-factor-outcomes.test.ts

## Purpose
Unit tests for `rejectLocked`, the helper that builds the 429 response returned when a user's 2FA (MFA) lock is active. The tests verify the response tells the client how long the lock still has to run. They need no database: the user is a stub and the clock is passed in as a fixed date.

## Key elements
- `NOW`: fixed date (`2030-01-01T12:00:00.000Z`) so every wait is exact arithmetic.
- `userLockedUntil(lockedUntil)`: builds a `UserDocument` stub holding only `mfaLockedUntil`, the one field `rejectLocked` reads.
- `waitOf(user)`: calls `rejectLocked(user, NOW)` and returns `errors[0].details?.retryAfter`.
- Test cases in `describe('rejectLocked')`:
  - The rejection has status `429` and first error code `RATE_LIMITED`.
  - For a lock still running, `retryAfter` is the time left, rounded up to whole seconds (+120000 ms gives 120, +119001 ms gives 120).
  - `retryAfter` is never less than 1 second (+1 ms gives 1).
  - With no live lock (`undefined` or a past date), `retryAfter` falls back to the full lock length, `MFA_LOCK_MS / 1000`.

## Relationships
- `src/modules/account/services/two-factor-outcomes.ts`: the module under test; provides `rejectLocked`.
- `src/modules/account/two-factor/index.ts`: supplies `MFA_LOCK_MS`, used to compute the fallback wait.
- `src/modules/users/index.ts`: supplies the `UserDocument` type (type-only import). `src/modules/users/model.ts` is not imported directly.
- `tests/support/stub.ts`: supplies `asStub` (imported via the `@tests/stub` alias), which casts the partial object to `UserDocument`.

## Notes
- The stub carries only `mfaLockedUntil`, so the tests would break if `rejectLocked` began reading other user fields.
- The fallback wait is the full lock duration, not zero, when the loaded user has no live lock.
