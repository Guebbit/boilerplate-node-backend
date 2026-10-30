---
source: src/modules/account/tests/unit/family-liveness.test.ts
sha256: 86fe83f3898a938ba5214a352f85cf35c212df3d12abcac6a6833ff7896eaa19
generated_at: 2026-10-29T03:04:33.046472+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/unit/family-liveness.test.ts

## Purpose

Unit tests for `resolveInLiveFamily`, verifying the decision logic that determines whether a family session is live, revoked, idle, or expired. The store is fully replaced with mocks; correctness of *which* rows the repository queries is deferred to the integration suite (as stated in the module docstring).

## Key elements

- **`resolve(caller, passive?)`** — thin wrapper around `resolveInLiveFamily('u1','f1','jwt', …)` that fixes the user/family/jwt args and passes a `passive` flag.
- **`SHOPPER` / `STAFF`** — caller fixtures differing only in `roles.tenant` (`null` vs `'editor'`), used to exercise the branch where only staff families are subject to idle and lifetime caps.
- **`ago(seconds)`** — returns a `Date` *seconds* in the past; used to fabricate `startedAt`, `lastActiveAt`, and `stampedAt` values.
- **`store`** — `asStub` handle over the mocked `sessionRepository`; tests assert on `familyActivity`, `touchFamily`, and `removeFamily` call counts/args.
- **`jest.mock('@modules/account/repository', …)`** — spreads the real module via `jest.requireActual` then overrides `sessionRepository` with three `jest.fn()`s.
- **`setEnvironment({ NODE_SESSION_IDLE_TIME_STAFF, NODE_SESSION_LIFETIME_STAFF })`** — controls the thresholds the code-under-test reads.

Test cases cover: no-live-row → `{ miss:'revoked' }`; staff idle > limit → `{ miss:'idle' }` + `removeFamily`; staff past lifetime cap (even if busy) → `{ miss:'expired' }` + `removeFamily`; cap disabled (`'0'`) → pass; shopper families never ended for age or idle; stamping (`touchFamily`) fires when `stampedAt` is absent or ≥ 1 min old, is skipped when fresh, is skipped for `passive` requests, and a stamp failure does not prevent resolution.

## Relationships

- **`src/modules/account/session/family-liveness.ts`** — the unit under test; this file imports and exercises `resolveInLiveFamily`.
- **`src/modules/account/repository.ts`** — mocked at the module boundary; `sessionRepository` (`familyActivity`, `touchFamily`, `removeFamily`) is stubbed so tests can control returned rows and assert on calls.
- **`tests/support/stub.ts`** — provides `asStub`, used to type-cast the mocked repository and to fabricate caller objects.
- **`tests/support/environment.ts`** — provides `setEnvironment` to inject `NODE_SESSION_IDLE_TIME_STAFF` / `NODE_SESSION_LIFETIME_STAFF` for each scenario.

## Notes

- The discriminated-union return of the function is `{ ok: caller }` or `{ miss: 'revoked' | 'idle' | 'expired' }`. Tests assert on the exact shape.
- `NODE_SESSION_LIFETIME_STAFF: '0'` means "no cap," not "zero seconds." Setting it to `'0'` in a test intentionally disables the lifetime check.
- Stamping is idempotent within a 60-second window: `touchFamily` is called at most once per minute per family. Passive requests count toward the idle calculation but never trigger a stamp.
- The mock uses `jest.requireActual` to preserve any other exports from the real repository module; only `sessionRepository`'s three methods are replaced.
