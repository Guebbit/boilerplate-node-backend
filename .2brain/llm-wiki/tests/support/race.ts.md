---
source: tests/support/race.ts
sha256: 310ad22390a1f7ea0445e5473fbf2fbca1bf28fc32a2ae4f3f21c4b3a77947f5
generated_at: 2026-10-15T12:59:51.592103+00:00
model: ollama:qwen3.8:27b
---

# tests/support/race.ts

## Purpose

Concurrency test harness. While most suites in the repo verify single-operation correctness, the race suites built on this file verify that N simultaneous copies of the same operation produce the correct *distribution* of outcomes (e.g., exactly one wins, the rest get 409). It exists because mutation testing and serial test runners structurally cannot exercise the "what happens when they overlap?" question.

## Key elements

- **`RACE_SIZE`** — participant count, driven by the `TEST_RACE_SIZE` knob (default 10, floor 2). The floor of 2 ensures at least two contenders.
- **`raceN<T>(count, build)`** — fires `count` simultaneous requests. Requests are *built* in an array then passed to `Promise.allSettled`; because supertest is a thenable, awaiting inside the loop would serialise them. Returns `PromiseSettledResult<T>[]`.
- **`statuses(results)`** — maps settled results to an ascending-sorted array of HTTP status codes; rejected participants are reported as `0` so a transport failure is visible in assertions.
- **`countStatus(results, status)`** — counts how many participants received exactly the given status.
- **`expectNoServerErrors(results)`** — universal invariant check: asserts zero 5xx codes, zero 429s, and zero rejections (status 0). Called by every race suite before its domain-specific assertions.

## Relationships

- **`tests/support/knobs.ts`** — provides `countKnob`, used to define `RACE_SIZE`.
- **`src/modules/account/tests/integration/auth-storage.test.ts`** — race suite for auth/credential storage; imports `raceN`, `statuses`, `countStatus`, `expectNoServerErrors`.
- **`src/modules/wishlist/tests/integration/wishlist-races.test.ts`** — race suite for wishlist add/remove concurrency; same imports.
- **`tests/integration/concurrency/auth-races.test.ts`** — race suite for concurrent signups against the same address.
- **`tests/integration/concurrency/cart-races.test.ts`** — race suite for concurrent cart mutations.
- **`tests/integration/concurrency/order-status-races.test.ts`** — race suite for simultaneous order-status transitions.
- **`tests/integration/concurrency/payment-races.test.ts`** — race suite for concurrent payment attempts.

## Notes

- **`--runInBand` (test:integration)** serialises *test files*, not the `Promise.allSettled` calls within a single test. Removing it would not increase concurrency inside a race; it would only cause parallel workers to share the in-memory Mongo and make tests flaky.
- **Rate limiters are raised, not disabled** (`setup-environment.ts` sets credential budgets to 1000). If a limiter truncated the race, the test would still pass vacuously ("not two succeeded" is trivially true when requests never reached the handler). `expectNoServerErrors` guards against this by explicitly rejecting 429s.
- **Supertest thenable semantics:** the request object is a thenable, not a Promise. It only initiates the HTTP call when awaited. The build-then-settle pattern in `raceN` is therefore load-bearing; refactoring to `await` inside a loop silently turns the test serial.
- **`Promise.allSettled` is intentional.** `Promise.all` rejects on the first failure and discards the remaining results, which are exactly the outcomes the assertions target.
- Rejected participants map to status `0` (not `undefined` or `-1`) so they sort to the front of the `statuses` array and are trivially filterable.
