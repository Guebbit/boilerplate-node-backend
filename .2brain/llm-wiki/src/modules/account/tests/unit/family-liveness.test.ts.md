---
source: src/modules/account/tests/unit/family-liveness.test.ts
sha256: 0e8f3254ebedcedca3e1bf2dfb38935000b7f3b001bea04b1ce7fdba7186bfb7
generated_at: 2026-10-15T10:14:56.796589+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/unit/family-liveness.test.ts

## Purpose

Unit tests for `resolveInLiveFamily`, verifying the family-liveness decision logic: whether a family is revoked, idle-ended, or treated as active based on caller role, last-seen timestamp, passive flag, and stamp freshness. The store is fully mocked so the tests isolate the decision rules from any real persistence behavior.

## Key elements

- **`resolveInLiveFamily`** (imported from `@modules/account/session/family-liveness`) — the function under test.
- **`sessionRepository`** (from `@modules/account/repository`) — mocked via `jest.mock`; only `familyActivity`, `touchFamily`, and `removeFamily` are replaced with `jest.fn()`.
- **`SHOPPER` / `STAFF`** — caller fixtures differing only in `roles.tenant` (`customer` vs. `editor`); used to exercise the idle-timeout branch that applies to staff but not shoppers.
- **`ago(seconds)`** — helper returning a `Date` offset from now; used to fabricate `lastActiveAt` / `stampedAt` values.
- **`resolve(caller, passive?)`** — thin wrapper that calls `resolveInLiveFamily` with fixed user/family/token and a stubbed caller provider.
- **`beforeEach`** — resets mocks, sets `NODE_SESSION_IDLE_TIME_STAFF` to `1800`, and gives `touchFamily`/`removeFamily` default resolutions.

## Relationships

- **`src/modules/account/session/family-liveness.ts`** — the module under test; this file imports `resolveInLiveFamily` and asserts its return values and side effects.
- **`src/modules/account/repository.ts`** — the sole external dependency, mocked at module level so no real query logic runs. The tests assert exactly which repository methods (`familyActivity`, `touchFamily`, `removeFamily`) are called and with what arguments.

## Notes

- The mock spread preserves all other members of `sessionRepository` (`...actual.sessionRepository`) so that any non-mocked method still works if accidentally invoked.
- `stampedAt` vs. `lastActiveAt` distinction matters: a request is considered "already stamped" only if `stampedAt` is within the last 60 s; `lastActiveAt` alone is insufficient to suppress `touchFamily`.
- The staff idle limit is set via `setEnvironment` to 1800 s; the idle-end test uses 1801 s (just past) and the shopper test uses 100 000 s (far past) to prove the role check gates the timeout path.
- A failing `touchFamily` (rejected promise) must not change the resolution outcome — the test asserts the caller is still returned successfully.
