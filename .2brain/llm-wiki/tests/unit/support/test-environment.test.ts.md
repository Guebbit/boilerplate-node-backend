---
source: tests/unit/support/test-environment.test.ts
sha256: ffc5c32042cf6465e278146b640a287e195f45da627aac0c2e6ae1940dc4967b
generated_at: 2026-09-23T20:32:34.288898+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/support/test-environment.ts

## Purpose

Unit tests for the Jest environment (`tests/support/test-environment.ts`). Each case starts a real environment, registers a timer or observer through it, tears the environment down, and asserts the registered callback never fires again — verifying the environment's core guarantee that nothing a test file registered keeps running (and pinning the VM context) after teardown.

## Key elements

- **`EnvironmentArguments`** — type alias for the two constructor args Jest passes to an environment.
- **`SETTLE_MS` (40)** — default settle window: long enough for 1 ms timers to tick several times, short enough to keep the suite fast.
- **`createEnvironment()`** — instantiates a real `TestEnvironment` with minimal `projectConfig`/`globalConfig` stubs, calls `.setup()`, and returns it ready to use.
- **`settle(ms?)`** — waits on the _real_ (host) clock via `setTimeout`, so the wait itself is never affected by the environment under test.
- **Test cases** (five) covering:
    - an uncleared `setInterval` stops ticking after teardown
    - a pending `setTimeout` does not fire after teardown
    - the file's _own_ timers (args, `clearTimeout`) still work while the environment is alive
    - `promisify(environment.global.setTimeout)` resolves correctly
    - a `PerformanceObserver` created on the real global is disconnected by teardown (marks before/after are distinguished)

## Relationships

- **`tests/support/test-environment.ts`** — the module under test; imported as the default export and instantiated in every case.
- **`tests/support/stub.ts`** — provides `asStub`, used to satisfy the two constructor parameters without building full Jest config objects.

## Notes

- `settle` intentionally uses the host `setTimeout`, not `environment.global.setTimeout`. Using the environment's timer would mean teardown could cancel the wait itself, defeating the test.
- The PerformanceObserver test registers the observer on the _real_ `globalThis` (via `node:perf_hooks`), not on `environment.global`. This exercises the path where a test file forgets to disconnect a real-world observer.
- Constructor args are deliberately minimal (`testEnvironmentOptions: {}`, `fakeTimers: {}`, empty `globalConfig`). Only fields that `jest-environment-node` actually reads need to be present.
