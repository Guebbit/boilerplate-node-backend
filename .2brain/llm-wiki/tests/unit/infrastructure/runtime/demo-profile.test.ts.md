---
source: tests/unit/infrastructure/runtime/demo-profile.test.ts
sha256: 8dcd5377e063d9c7b45e6b73cc097fd13e1e6308112cd4c7da39e6ba048967f5
generated_at: 2026-09-23T20:26:00.154351+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/runtime/demo-profile.test.ts

## Purpose

Unit tests for the demo-profile runtime flag. Verifies that `isDemoMode()` reflects the state toggled by `enableDemoProfile()`, and that the flag is forcibly denied (with a logged error) when `NODE_ENV` is `production`.

## Key elements

- **`it('is demo mode exactly when enableDemoProfile() was called')`** — Asserts `isDemoMode()` is `false` by default, then `true` after `enableDemoProfile()` is invoked.
- **`it('refuses production even after enableDemoProfile(), and logs it')`** — Calls `enableDemoProfile()`, sets `NODE_ENV` to `'production'`, and asserts `isDemoMode()` stays `false` while `logger.error` is called with a message containing the word "production".
- **`afterEach`** — Resets demo-profile state via `enableDemoProfile(false)` and restores the original `NODE_ENV` value captured before the suite runs.

## Relationships

- **`src/infrastructure/runtime/demo-profile.ts`** (SUT) — Provides `enableDemoProfile` and `isDemoMode`; every assertion in this file targets these two exports.
- **`src/infrastructure/adapters/logger.ts`** — The `logger.error` method is spied on (`jest.spyOn`) to verify the production-guard path emits a diagnostic message. No other logger methods are exercised.

## Notes

- `enableDemoProfile` is called with **no argument** in the positive test (treated as "enable") and with **`false`** in teardown (treat as "disable"). The API is therefore a single boolean flag setter.
- The production-guard test does **not** mock `enableDemoProfile`; it calls the real implementation and then flips `NODE_ENV`. The guard is evaluated at read-time (`isDemoMode()`), not at enable-time.
- `logger.error` is expected to return `logger` (method-chaining pattern), which is why the mock implementation returns `logger`.
