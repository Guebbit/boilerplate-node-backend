---
source: src/infrastructure/http/middlewares/store-breaker.ts
sha256: 05581014a64d23afe5b7723a03794c06146b840ba7f7cb56603249aeffe0f778
generated_at: 2026-11-08T03:33:02.516044+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/http/middlewares/store-breaker.ts

## Purpose

A hand-rolled circuit breaker that wraps the single shared Redis instance used by all rate-limit budgets. Without it, a dead Redis would cost every request its full connect timeout on every budget for the entire duration of the outage. The breaker short-circuits Redis calls after a failure, opens for a fixed window, then admits exactly one probe request to test recovery.

## Key elements

- **`Breaker`** (interface) — the three-method contract the caller drives:
  - `admit(): boolean` — returns `true` if the caller may attempt Redis (always in closed state; only the single probe in the post-window state; `false` otherwise).
  - `succeeded(): void` — closes the breaker (resets window and probe flag).
  - `failed(): void` — re-opens the breaker for a full window and clears the probe flag.
- **`createBreaker(windowMs: number, now?: () => number): Breaker`** — factory that returns a closure-based state machine. Two internal variables: `openUntil` (timestamp, `0` = closed) and `probing` (boolean). The `now` parameter defaults to `Date.now` and is injectable for tests.

## Relationships

- **`src/infrastructure/http/middlewares/rate-limit-store.ts`** — consumer. It instantiates a `Breaker` via `createBreaker` and calls `admit()` / `succeeded()` / `failed()` around each of the four `Store` interface methods so that a single shared breaker gates all budgets' Redis access.
- **`tests/unit/infrastructure/http/middlewares/store-breaker.test.ts`** — unit tests. Exercises the state machine by injecting a fake `now` clock to avoid real-time waits.

## Notes

- The breaker is deliberately not a library wrapper. The JSDoc explains: `express-rate-limit`'s `Store` is a four-method interface and the open/closed state must be shared across all four calls, which a per-function-call wrapper can't express.
- `openUntil === 0` is the closed sentinel; it is not a valid timestamp, so the check is `===` not `<=`.
- The probe is exactly one caller per window because `probing` is a plain boolean — there is no counter. If the probe fails, `failed()` resets `probing` to `false`, so the next call after the new window can probe again.
- The breaker is purely synchronous and in-process. It is not shared across worker processes; each process gets its own instance.
