---
source: src/modules/account/tests/unit/family-liveness.test.ts
source_sha256: ccc7b6339900be700591dd42923c05b037ef3ec84aef281ba820dd67f3033e4d
context_sha256: 6351cdef963681f3a371b8873fe298921bc76e87cdc2b3bfe8fc1364e986c42e
generated_at: 2026-11-22T04:05:40.038226+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/tests/unit/family-liveness.test.ts

## Purpose
Unit tests for `resolveInLiveFamily` (`src/modules/account/session/family-liveness.ts`). They check that a family with no live row is revoked, that a staff family is ended when idle past its limit or past its lifetime cap, and that live requests are stamped as activity unless they are passive. The session store is replaced with mocks, so what the real repository queries select is left to the integration suite.

## Key elements
- **`jest.mock('@modules/account/repository')`**: keeps the real module but replaces `sessionRepository.familyActivity`, `touchFamily` and `removeFamily` with `jest.fn()`.
- **`store`**: the mocked repository methods, typed through `asStub`.
- **`SHOPPER` / `STAFF`**: caller fixtures. `SHOPPER` has no tenant or platform role. `STAFF` has the tenant role `editor`.
- **`ago(seconds)`**: returns a `Date` that many seconds in the past.
- **`resolve(caller, passive)`**: calls `resolveInLiveFamily('u1', 'f1', 'jwt', loader, { passive })`.
- **`clockOf`**: pulls `ok.sessionClock` out of a resolve result.
- **`beforeEach`**: resets all mocks, sets `NODE_SESSION_IDLE_TIME_STAFF=1800`, and makes `touchFamily` resolve `true` and `removeFamily` resolve `1`.

Cases covered:
- No live row gives `{ miss: 'revoked' }`.
- A staff family idle past 1800s gives `{ miss: 'idle' }` and is removed with `removeFamily('u1','f1')`.
- A staff family started more than 86,400s ago gives `{ miss: 'expired' }` even when busy, and is removed.
- A staff family inside the cap is accepted. Setting `NODE_SESSION_LIFETIME_STAFF=0` turns the cap off.
- A shopper's family is never ended for age or idleness, and `removeFamily` is not called.
- `touchFamily` runs when there is no `stampedAt` or when it is over a minute old. It does not run when stamped within the minute.
- A passive request is judged but never stamped.
- A `touchFamily` rejection does not stop the request from being answered.
- Session clock returned to the caller:
  - When this request writes the stamp, `lastActiveAt` is about now and `startedAt` is preserved.
  - When the saved stamp is still fresh, it is kept.
  - A passive request keeps the saved stamp, even a stale one.

## Relationships
- Tests `resolveInLiveFamily` from `src/modules/account/session/family-liveness.ts`.
- Mocks `sessionRepository` in `src/modules/account/repository.ts`, spreading the real module and overriding only three methods.
- Uses `asStub` from `tests/support/stub.ts` and `setEnvironment` from `tests/support/environment.ts`.
- The module header says the store's real queries are covered by the integration suite. The neighboring integration tests (account revocation causes, session epoch and session modes, plus the API-key and user session-epoch tests) are related through the graph. This file does not import them.

## Notes
- `jest.mock` is declared between the helper imports and the imports of the code under test.
- The "ok" assertions use `toMatchObject({ ok: caller })`, because the result also carries the `sessionClock`.
- The 60-second stamp throttle, the 1800s idle limit and the 86,400s lifetime cap are inferred from test inputs. The thresholds themselves live in `family-liveness.ts` and the environment.
- The lifetime cap is only exercised through `NODE_SESSION_LIFETIME_STAFF`: the default applies in the first case, and `'0'` disables it.
