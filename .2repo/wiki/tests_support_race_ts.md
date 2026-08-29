# tests/support/race.ts

## Purpose

Concurrency-test harness that fires N identical HTTP requests truly simultaneously and exposes per-participant outcomes for assertion. It exists because serial test suites (and mutation testing) cannot verify that a race condition is actually handled — the question is "does it still do the right thing when all of it happens at once?"

## Key elements

- **`RACE_SIZE`** — default participant count (10); large enough to contend, small enough to stay fast.
- **`raceN(count, build)`** — builds `count` request promises in a single array, then awaits them all via `Promise.allSettled`. Returns `PromiseSettledResult<T>[]`. Deliberately builds-then-awaits because supertest is a thenable that starts on await, so sequential await inside a loop would be serial, not concurrent.
- **`statuses(results)`** — maps settled results to their HTTP status (rejected → `0`) and returns them sorted ascending.
- **`countStatus(results, status)`** — number of participants whose status equals `status`.
- **`expectNoServerErrors(results)`** — shared invariant assertion: no 5xx, no 429, no transport-level rejections (status `0`). Intended to run in every race suite before suite-specific assertions.

## Relationships

- **`tests/integration/concurrency/auth-races.test.ts`**, **`cart-races.test.ts`**, **`wishlist-races.test.ts`** — the three consumer suites. Each imports `raceN`, `countStatus`, `statuses`, and `expectNoServerErrors` to drive and assert its respective race scenario.
- **`docs/tools/concurrency-testing.md`** — user-facing documentation explaining how to author a new race suite against this harness.

## Notes

- **`Promise.allSettled`, never `Promise.all`.** The design contract is that losing participants (rejections) are the expected, assertable outcome. `Promise.all` would reject on the first failure and discard the rest.
- **Rate limiters are raised, not disabled** (in `tests/support/setup.ts`). At the default 10-req budget an `N=10` race sits exactly on the limit and `N=12` starts producing 429s. The `expectNoServerErrors` assertion explicitly rejects 429 so a limiter-truncated race cannot pass vacuously.
- **`--runInBand`** (passed by `npm run test:integration`) serialises test *files* against the shared in-memory Mongo; it does not serialise the concurrent requests inside a single test.
- **Rejected participants are represented as status `0`**, which never collides with a real HTTP code, making transport-level failures visible in assertions instead of silently absent.
- The file imports `Response` from `supertest` as a **type only** — no runtime dependency.
