---
source: src/infrastructure/http/middlewares/store-breaker.ts
source_sha256: 0716b034a5560acb112a924931c7e67aecb96c5694b25b9796c833600ec56f1c
context_sha256: 7f5bfaf70a19fd8dff94a084dc66ec29e25b042f71b93215680a1f39d868bc60
generated_at: 2026-11-22T02:52:24.980913+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/http/middlewares/store-breaker.ts

## Purpose
A hand-rolled circuit breaker for the single shared Redis behind all rate-limit budgets. Without it, a dead Redis makes every request wait the full connect timeout (1 s) before the store error, on every budget, for the whole outage. It is written by hand because breaker libraries wrap a function call, whereas `express-rate-limit`'s `Store` is a four-method interface that needs one shared state across all methods.

## Key elements
- `Breaker` (interface): the state machine, driven by whoever calls Redis.
  - `admit()`: whether this call may try Redis. Closed: always `true`. Open: `false` until the window passes. After that, exactly one caller gets `true` (the probe) and the rest get `false` until the probe reports back.
  - `succeeded()`: the Redis call worked; closes the breaker.
  - `failed()`: the Redis call (or the probe) failed; opens the breaker for a full window.
- `createBreaker(windowMs, now = Date.now)`: builds one breaker. `windowMs` is how long it stays open after a failure before one probe is allowed. `now` is an injectable clock so tests don't wait out the window.

## Relationships
- `rate-limit-store.ts`: the neighboring store module. The breaker's doc comment says it guards the Redis behind the rate-limit `Store`. This file does not import it, so the store is the caller that invokes `admit`/`succeeded`/`failed`.
- `tests/unit/infrastructure/http/middlewares/store-breaker.test.ts`: unit tests for the breaker. The injectable `now` exists so they can control time.

## Notes
- Lifecycle: closed, then a failure opens it for a fixed window, then one probe, then success closes it or failure re-opens it.
- State is two closure variables: `openUntil` (0 means closed) and `probing`.
- The caller must report back (`succeeded` or `failed`) after an admitted call. While `probing` is true, other callers are refused. Nothing in this file times out a probe that never reports.
