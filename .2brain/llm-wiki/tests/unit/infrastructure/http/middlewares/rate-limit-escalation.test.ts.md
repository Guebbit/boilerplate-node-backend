---
source: tests/unit/infrastructure/http/middlewares/rate-limit-escalation.test.ts
sha256: 2e8945f953091d89e14aab395cff5ba05d5de068a66b136ee512aa408b5c723e
generated_at: 2026-11-08T10:15:31.387887+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/http/middlewares/rate-limit-escalation.test.ts

## Purpose

Unit tests for the **escalation** behaviour of `rateLimitStore`: once a key trips its cap, each consecutive lockout doubles in duration (up to a configured ceiling), and a key that stays quiet long enough is fully forgotten. The suite runs against the in-process memory store (Redis URL blanked) on a fake clock, because the property under test is purely temporal.

## Key elements

- **`WINDOW_MS`** (1000) — the 1-second base window used throughout this file.
- **`freshStore()`** — builds a new `Store` via `rateLimitStore('test-escalation', 'memory', { limit: 2, doublings: 3 })` and calls `init` with the window; returns it ready for use.
- **`refused(store, key?)`** — increments one hit and resolves `true` when `totalHits > 2` (i.e. the request was refused).
- **`tripCap(store, key?)`** — fires three hits in sequence; asserts the third is refused. Used to deterministically enter a lockout.
- **`beforeEach` / `afterEach`** — switch Jest to fake timers and back.
- **`describe('an escalating store')`** — eight `it` blocks covering: base-window expiry, doubling up to the 8 s ceiling, consecutive-trip lengthening, quiet-forgetting, key isolation, `decrement` at base vs. escalated level, and `resetKey` clearing all levels plus the strike count.

## Relationships

- **`src/infrastructure/http/middlewares/rate-limit-store.ts`** — the module under test. The file imports `rateLimitStore` (a factory that returns an `express-rate-limit` `Store` with escalation logic) and exercises its `increment`, `decrement`, `resetKey`, and `get` contracts. No other source module is imported.

## Notes

- The memory-store implementation (`MemoryStore#get`) still returns an entry whose window has expired until its periodic sweep runs. The doc comment flags this as the reason the "ends exactly when its window does" assertions exist.
- The "quiet" period that resets a key is **base × 2^(doublings + 1)** — here 16 s (1 s × 2⁴). This is larger than the maximum lockout (8 s), so a key must be idle for longer than its worst-case lockout to be forgotten.
- `store.init` is called with a cast (`as Parameters<NonNullable<Store['init']>>[0]`) because the `Store` type's `init` signature is broader than what this test needs to pass.
- All timing assertions advance by `lockout − 1` (still locked) then `+ 2` (just past), deliberately straddling the boundary to catch off-by-one errors in the expiry check.
