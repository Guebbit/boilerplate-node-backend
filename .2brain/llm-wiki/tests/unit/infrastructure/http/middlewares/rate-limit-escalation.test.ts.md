---
source: tests/unit/infrastructure/http/middlewares/rate-limit-escalation.test.ts
sha256: c08336d8f4beb023674ea2ae0a90de0098fbee2bcde6429aa399fa571a5e6307
generated_at: 2026-10-15T13:13:25.732092+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/http/middlewares/rate-limit-escalation.test.ts

## Purpose

Unit tests for the escalation behavior of `rateLimitStore`: after a key trips the hit cap, each successive lockout doubles (up to a ceiling) and a key that stays quiet long enough is forgotten back to first-offender status. The suite runs against the in-process memory store (Redis URL blanked) on Jest fake timers because the property under test is purely "how long the lockout lasts."

## Key elements

- **`WINDOW_MS`** — 1 000 ms base window; the store is configured with `limit: 2` and `doublings: 3`, yielding lockouts of 1 s → 2 s → 4 s → 8 s (then capped at 8 s).
- **`freshStore()`** — Builds a new `Store` via `rateLimitStore('test-escalation', 'memory', …)` and calls the optional `store.init` hook to wire the window.
- **`refused(store, key?)`** — Calls `store.increment`, returns `true` when `totalHits > 2` (i.e. the hit was denied).
- **`tripCap(store, key?)`** — Sends three hits to the same key; the third is asserted as refused.
- **`beforeEach` / `afterEach`** — Toggle `jest.useFakeTimers()` / `jest.useRealTimers()` around every test.
- **`describe('an escalating store')`** — Eight `it` blocks covering: base window expiry, doubling sequence, no-reset continuity, forgetting (strike-memory timeout), key isolation, `decrement` restoring headroom, `resetKey` clearing all levels + strike count, and `store.get` exposing the current level.

## Relationships

- **`src/infrastructure/http/middlewares/rate-limit-store.ts`** — Sole production dependency. The test imports `rateLimitStore` and exercises its escalation, decrement, reset, and `get` contract. No other modules are touched.

## Notes

- The store is created with the `'memory'` backend, so the suite never touches Redis; the `store.init` call is cast through `Parameters<NonNullable<Store['init']>>[0]` to satisfy the `express-rate-limit` type without importing a real adapter.
- Strike-memory (the quiet period before a key is forgotten) is `WINDOW_MS × 2^(doublings + 1)` = 16 s in this file's configuration; the "forgets a key" test advances exactly that far.
- The "doubles each lockout" test intentionally does **not** call `resetKey` between trips — it verifies that escalation is cumulative across consecutive trips with no manual reset.
- `store.decrement` is the mechanism for "un-counting" a hit (e.g. a downstream service error); the test confirms that decrementing back to zero restores the full cap.
