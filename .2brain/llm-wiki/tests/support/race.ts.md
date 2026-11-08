---
source: tests/support/race.ts
sha256: 310ad22390a1f7ea0445e5473fbf2fbca1bf28fc32a2ae4f3f21c4b3a77947f5
generated_at: 2026-11-08T09:57:49.620623+00:00
model: ollama:qwen3.8:27b
---

# tests/support/race.ts

## Purpose

A concurrency test harness that lets integration suites assert on the *distribution* of outcomes when N identical HTTP requests are fired simultaneously. It exists because mutation testing and serial suites cannot catch logic that is only wrong under parallelism (e.g., a signup race where nine losers must each get a distinct 4xx, not a 500 or a 429).

## Key elements

- **`RACE_SIZE`** — Participant count for races, driven by the `TEST_RACE_SIZE` env var via `countKnob`. Default 10, floored at 2.
- **`raceN<T>(count, build)`** — Builds `count` request-thenables in a loop, then awaits them with `Promise.allSettled`. Returns the full array of `PromiseSettledResult<T>`. The build-then-await ordering is what guarantees genuine overlap (supertest fires when awaited).
- **`statuses(results)`** — Maps each settled result to its HTTP status (fulfilled → `value.status`; rejected → `0`) and returns them sorted ascending.
- **`countStatus(results, status)`** — Counts how many participants answered with exactly the given status code.
- **`expectNoServerErrors(results)`** — Universal shape assertion every race test must call: no 5xx, no 429, no 0 (transport-level failure).

## Relationships

- **`tests/support/knobs.ts`** — Source of `countKnob`, the helper that resolves `RACE_SIZE` from the environment with a floor.
- **Consumer test suites** (auth-races, auth-storage, order-status-races, wishlist-races, account-deletion-races, cart-races, payment-races) — Each imports `raceN`, `countStatus`, and `expectNoServerErrors` to drive and assert concurrent-request scenarios. They supply the `build` closure that constructs a supertest request per participant.

## Notes

- `Promise.allSettled` is mandatory here, never `Promise.all`. A race is expected to produce rejections (e.g., duplicate-address signups); `all` would abort on the first and discard the outcomes under test.
- `--runInBand` (used by `npm run test:integration`) serialises test *files* only; it does not serialise the `Promise.allSettled` block inside a single test. Removing it would not increase concurrency — it would introduce flakiness from a shared in-memory Mongo.
- Rate limiters are raised (to 1000) in the environment setup, not disabled. If a limiter truncated the race, the "only one winner" assertion would pass vacuously. `expectNoServerErrors` guards against this by explicitly rejecting 429 rather than lumping it with other non-success codes.
- Rejected (transport-level) supertest promises are mapped to status `0`, a value no real HTTP response uses, so they surface in `statuses` output instead of vanishing silently.
