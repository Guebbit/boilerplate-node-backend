---
source: scenarios/support/demo-clock.ts
source_sha256: b93499e89af1b966ff9264620b0a820f529db22088e7ad9775b97b4838b3003c
context_sha256: 98bcf93724bbef7223e5e630364f4c3a7363f611ee201d5b5d043dc792d19f6b
generated_at: 2026-11-22T01:46:36.764938+00:00
model: claude-code:claude-sonnet-5-5
---

# scenarios/support/demo-clock.ts

## Purpose
Provides the demo profile's clock: a `Date`-only fake (built on `@sinonjs/fake-timers`) that time-travel journeys can move forward. Only `Date` is faked because the Mongo driver and Node keep their own timers (heartbeats, socket timeouts) that must keep running for round trips to work. It mirrors the choice made in `tests/support/clock.ts` for jest.

## Key elements
- `DemoClock` (interface): `now()` returns the current fake instant as a `Date`; `offsetMs()` returns how far ahead of real time the clock is (never below 0); `advance(ms)` moves forward only; `reset()` returns to real time.
- `registerDemoClock(clock)`: stores the clock in a module-level slot; pass `undefined` to unregister (used by tests).
- `getDemoClock()`: returns the registered clock, or `undefined` if none.
- `installDemoClock()`: installs the fake (`toFake: ['Date']`, `shouldAdvanceTime: true`) and returns a `DemoClock` plus `uninstall()` to restore the real `Date`.
- `realNow()` (private): real wall time computed as `performance.timeOrigin + performance.now()`, since `performance` is not faked.

## Relationships
- `scenarios/run-server.ts`: the only place that installs the clock and registers it, per the module header.
- `scenarios/support/demo.ts`: the control surface; it reads the clock via `getDemoClock()`. If none is registered (for instance, a test mounting the routes directly), it gets a clean "no clock" answer.
- `tests/integration/scenarios/demo-routes.test.ts` and `tests/unit/scenarios/demo-clock.test.ts`: exercise the routes and the clock. The `registerDemoClock(undefined)` and `uninstall()` hooks exist for test setup and cleanup.

## Notes
- `advance` throws a `RangeError` for negative or non-finite values. Time never goes backward, so one spec cannot hand the next a session that has not started yet.
- `shouldAdvanceTime: true` keeps the fake ticking at real speed between jumps.
- `advance` and `reset` use `setSystemTime`, which shifts `Date` without firing timers.
- `reset` sets the clock to the real time, so `offsetMs()` returns to about 0.
- Never installed by a deployment, and the server never calls `uninstall`.
