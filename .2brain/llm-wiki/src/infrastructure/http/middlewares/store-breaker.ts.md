---
source: src/infrastructure/http/middlewares/store-breaker.ts
sha256: 05581014a64d23afe5b7723a03794c06146b840ba7f7cb56603249aeffe0f778
generated_at: 2026-10-14T07:58:38.851539+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/http/middlewares/store-breaker.ts

## Purpose

A hand-rolled circuit breaker for the single shared Redis instance behind all rate-limit budgets. Without it, a dead Redis forces every request on every budget to pay its full connect timeout (~1 s) for the duration of the outage. The breaker opens after a failure, stays open for a fixed window, then allows exactly one probe call before re-opening on failure or closing on success.

## Key elements

- **`Breaker` (interface)** — Three-method state machine: `admit()` returns whether the caller may attempt Redis; `succeeded()` closes the breaker; `failed()` re-opens it for a full window.
- **`createBreaker(windowMs, now?)` (factory)** — Builds a `Breaker` instance. `windowMs` is the open duration; `now` is an injectable clock (defaults to `Date.now`) so tests can control time.

## Relationships

- **`src/infrastructure/http/middlewares/rate-limit-store.ts`** — Consumes the `Breaker` to gate every Redis call the store makes (the four `Store` interface methods share one breaker instance so state is consistent across them).
- **`tests/unit/infrastructure/http/middlewares/store-breaker.test.ts`** — Unit tests; use the injectable `now` parameter to advance past the open window without real waiting.

## Notes

- `openUntil === 0` is the "closed" sentinel; there is no separate boolean flag.
- The probe slot is a single `probing` boolean: once set, all subsequent `admit()` calls return `false` until `succeeded()` or `failed()` resets it.
- Hand-rolled (not a library) because `express-rate-limit`'s `Store` is a multi-method interface, not a single callable that breaker libraries wrap.
- See `docs/tools/security.md#when-the-limits-redis-is-down` for operational context.
