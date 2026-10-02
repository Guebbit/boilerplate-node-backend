---
source: scenarios/support/demo-clock.ts
sha256: be15abcb59d48bb9b150af81a4f9b2a64c94fe9bfd2966c138bc5b996e1e5cd8
generated_at: 2026-10-01T12:24:00.183049+00:00
model: ollama:qwen3.8:27b
---

# scenarios/support/demo-clock.ts

## Purpose

Installs a `Date`-only fake clock for the demo profile so that journey steps can "time travel" by advancing `Date` while all other timers (Mongo heartbeats, Node socket timeouts, `performance`) keep ticking in real time. It exists because the demo server needs controllable elapsed time for rules that read `Date.now()` / `new Date()`, without freezing the underlying I/O round-trips.

## Key elements

- **`realNow`** (module-private) — Reads the true wall-clock from `performance.timeOrigin + performance.now()`, a source the fake does not touch. Used as the initial `now` value and as the reset target.
- **`installDemoClock`** (export) — Wraps `@sinonjs/fake-timers#install` with `toFake: ['Date']` and `shouldAdvanceTime: true`. Returns the `DemoClock` interface plus an `uninstall` handle:
  - `now()` — current (possibly advanced) `Date`.
  - `offsetMs()` — how far ahead the fake is relative to real time (clamped ≥ 0).
  - `advance(ms)` — shifts `Date` forward via `setSystemTime`; throws `RangeError` for negative or non-finite input.
  - `reset()` — snaps `Date` back to `realNow()`.
  - `uninstall()` — restores the real `Date` global (intended for test cleanup, not the server).

## Relationships

- **`scenarios/run-server.ts`** — The sole caller of `installDemoClock`. It registers the returned clock only when the process has the demo profile active; never invoked in a production deployment.
- **`src/infrastructure/runtime/demo-clock.ts`** — Exports the `DemoClock` type that `installDemoClock` structurally satisfies and returns.
- **`tests/unit/scenarios/demo-clock.test.ts`** — Unit-tests the `installDemoClock` contract (advance, reset, offset, uninstall, negative-advance rejection).

## Notes

- **`Date` is the only faked API.** `setInterval`, `setTimeout`, `performance`, and all Node/Mongo internal timers remain real. This is deliberate: faking them would freeze database round-trips and socket liveness.
- **`shouldAdvanceTime: true`** means the fake clock keeps ticking at 1× real speed between explicit `advance` calls, so any code measuring elapsed `Date` time never sees a frozen world.
- **`advance` is monotonic** — it rejects negative and non-finite values rather than silently clamping.
- **`uninstall` is test-only.** The demo server's lifetime outlives the clock; the process is expected to exit rather than restore `Date`.
