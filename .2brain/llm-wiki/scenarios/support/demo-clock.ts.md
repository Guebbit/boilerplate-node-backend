---
source: scenarios/support/demo-clock.ts
sha256: f3e1f4f008d609e3b009c16af2f97e1a27414c1225c31403e790beb2fdd58bec
generated_at: 2026-11-08T02:32:43.251048+00:00
model: ollama:qwen3.8:27b
---

# scenarios/support/demo-clock.ts

## Purpose

A `Date`-only fake clock for the demo profile. It lets scenario specs move time forward (to age TTLs, cooldowns, etc.) without freezing the Node event loop or the Mongo driver's own timers. Only `Date` is faked; everything else (sockets, heartbeats, `setTimeout`) keeps running on the real clock. The module also provides a register/get slot so the demo control surface can reach the clock when one is installed, and get `undefined` otherwise.

## Key elements

- **`DemoClock`** (interface) — the public shape a spec interacts with: `now()`, `offsetMs()`, `advance(ms)`, `reset()`.
- **`installDemoClock()`** — wraps `@sinonjs/fake-timers` `install` with `toFake: ['Date']` and `shouldAdvanceTime: true`; returns a `DemoClock` plus an `uninstall()` handle.
- **`registerDemoClock(clock)`** / **`getDemoClock()`** — a single-slot register/lookup pair. Called once by `run-server.ts`; returns `undefined` when no clock was installed (the default for test harnesses that mount routes directly).
- **`realNow()`** (private) — reads true wall-clock time via `performance.timeOrigin + performance.now()`, a source the fake never touches.
- **`advance(ms)`** — shifts `Date` forward via `clock.setSystemTime`; throws `RangeError` for negative or non-finite input.

## Relationships

- **`scenarios/run-server.ts`** — the sole caller of `installDemoClock()` and `registerDemoClock()`; it wires the clock into the demo server at startup.
- **`scenarios/support/demo.ts`** — the demo control surface (`./demo` endpoint) reads the clock through `getDemoClock()`; if none is registered it receives `undefined` and skips time-related actions.
- **`tests/unit/scenarios/demo-clock.test.ts`** — unit-tests the `DemoClock` contract (forward-only advance, offset arithmetic, reset) against the real `installDemoClock` output.
- **`tests/integration/scenarios/demo-routes.test.ts`** — registers an uninstalled state (or a fresh clock) so route-level specs see the "no clock" path unless they explicitly install one.

## Notes

- `advance` is **forward-only** by design: allowing backward travel could let one spec hand the next a session that "has not started yet."
- `shouldAdvanceTime: true` means the fake drifts with real elapsed time between explicit jumps; `offsetMs()` therefore grows even without an `advance` call.
- The `uninstall()` handle is returned alongside the clock but is **only** intended for test cleanup. The server process never calls it (it lives for the process lifetime).
- The module is `@module`-scoped; it has no default export. All public surface is the named exports listed above.
