---
source: tests/support/race.ts
sha256: 281dc76fea914eed72bb0ca0b4f36f17eeaf6aea85cdbcde6314a47e6cfea837
generated_at: 2026-09-23T20:12:46.686335+00:00
model: ollama:qwen3.8:27b
---

# tests/support/race.ts

## Purpose

Concurrency test harness that fires N identical HTTP requests truly in parallel and provides assertion helpers for the outcomes. It exists because "does this operation work?" and "does it still work when ten of them land at once?" are different questions, and mutation testing cannot answer the second.

## Key elements

- **`RACE_SIZE`** — Default participant count (10), overridable via `TEST_RACE_SIZE` env var, floored at 2. Sourced from `countKnob`.
- **`raceN(count, build)`** — Builds `count` request-thenables up front, then awaits them all via `Promise.allSettled`. Returns `PromiseSettledResult<T>[]`. The build-then-await order is what makes the requests overlap (supertest starts on `.then()`, not on construction).
- **`statuses(results)`** — Maps settled results to an ascending-sorted array of HTTP status codes. Rejected (transport-level) participants are reported as `0`.
- **`countStatus(results, status)`** — Number of participants that received exactly the given status.
- **`expectNoServerErrors(results)`** — Fails the test if any participant saw a 5xx, a 429, or a rejected connection (status 0). Called at the top of every race assertion.

## Relationships

- **`tests/support/knobs.ts`** — Provides `countKnob`, which `RACE_SIZE` uses to read the `TEST_RACE_SIZE` environment variable with a minimum.
- **`tests/integration/concurrency/auth-races.test.ts`**, **`cart-races.test.ts`**, **`wishlist-races.test.ts`** — The three suites that import `raceN`, `statuses`, `countStatus`, and `expectNoServerErrors` to drive their respective concurrent-request assertions.

## Notes

- **`Promise.allSettled`, never `Promise.all`.** In a race, rejection is the _correct_ outcome (e.g. 9 of 10 duplicate signups must 409). `Promise.all` would discard the very results the tests assert on.
- **Supertest is a thenable, not a promise.** Awaiting inside the `build` callback would serialise the requests. The harness builds all thenables first, then hands the array to `allSettled`.
- **`--runInBand` serialises test _files_, not in-test concurrency.** It protects the in-memory Mongo from parallel workers; it does not reduce the parallelism inside a single `raceN` call. Removing it would not make tests "more concurrent" and would introduce unrelated flakiness.
- **Rate limiters are raised (budget = 1000) in `setup.ts`, not disabled.** `expectNoServerErrors` explicitly rejects 429 so a truncated race cannot pass vacuously.
- **Status `0` means the server never answered** (rejected supertest promise). It is kept distinct from real codes so a transport failure surfaces in assertions instead of vanishing.
