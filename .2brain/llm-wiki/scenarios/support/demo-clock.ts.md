---
source: scenarios/support/demo-clock.ts
sha256: f3e1f4f008d609e3b009c16af2f97e1a27414c1225c31403e790beb2fdd58bec
generated_at: 2026-10-14T07:02:25.437632+00:00
model: ollama:qwen3.8:27b
---

# scenarios/support/demo-clock.ts

## Purpose

Provides a `Date`-only fake clock for the demo profile. It replaces the global `Date` with a controllable one (via `@sinonjs/fake-timers`) so scenario specs can "age" time-dependent logic, while leaving every other timer (`setTimeout`, sockets, Mongo heartbeats) on the real clock. Installed exclusively by the scenario runner—never by a deployment.

## Key elements

- **`DemoClock` (interface)** — the public contract: `now()`, `offsetMs()`, `advance(ms)`, `reset()`.
- **`installDemoClock()`** — calls sinonjs `install` with `toFake: ['Date']` and `shouldAdvanceTime: true`; returns a `DemoClock` object plus an `uninstall()` for test cleanup.
- **`registerDemoClock(clock | undefined)`** — stores the clock in a module-level slot so the `./demo` control surface can retrieve it.
- **`getDemoClock()`** — reads the slot; returns `undefined` when no clock is installed (e.g., tests that mount routes directly).
- **`realNow()`** (private) — reads true wall-clock time from `performance.timeOrigin + performance.now()`, a source the fake does not touch.

## Relationships

- **`scenarios/run-server.ts`** — sole caller of `installDemoClock()` in the running-server path; registers the result via `registerDemoClock()`.
- **`scenarios/support/demo.ts`** — the `./demo` control surface; reads the clock through `getDemoClock()`. Receives `undefined` when a test mounts the routes without installing a clock.
- **`tests/unit/scenarios/demo-clock.test.ts`** — exercises `installDemoClock()` / `uninstall()` and the `advance` / `reset` / `offsetMs` semantics in isolation.
- **`tests/integration/scenarios/demo-routes.test.ts`** — mounts demo routes directly (no clock installed), relying on `getDemoClock()` returning `undefined`.

## Notes

- **Forward-only.** `advance(ms)` throws `RangeError` for negative or non-finite input; `reset()` returns to *current* real time, not the install-time snapshot.
- **No timers are faked.** Only `Date` is replaced. `shouldAdvanceTime: true` keeps the fake ticking at real speed between explicit jumps, so any elapsed-time measurement sees a moving clock.
- **`uninstall` is a test concern.** The server never calls it; unit tests use it in `afterEach`.
- **Slot is singular.** Calling `registerDemoClock` a second time overwrites the previous registration with no warning.
