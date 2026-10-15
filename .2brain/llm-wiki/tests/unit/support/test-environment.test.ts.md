---
source: tests/unit/support/test-environment.test.ts
sha256: 7952d10e6742a1ea7b8ebb560fbebf3af9b07ca45e0184b8fbd1602b27dda32d
generated_at: 2026-10-15T13:33:35.945699+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/support/test-environment.test.ts

## Purpose

Unit tests for the custom Jest environment (`TestEnvironment`). The central guarantee under test is that nothing a test file registered—timers, observers, coverage records—keeps running or pinning memory after `teardown()` completes. Each case builds a real environment, starts work through it, calls `teardown()`, and asserts the side-effect is gone.

## Key elements

- **`SETTLE_MS` (40)** — Duration for real-clock waits; long enough for 1 ms timers to fire several times, short enough to keep the suite fast.
- **`createEnvironment()`** — Instantiates `TestEnvironment` with minimal `projectConfig`/`globalConfig` stubs (via `asStub`), calls `setup()`, and returns the ready environment.
- **`settle(ms?)`** — Waits on the **real** clock (outside the environment) so the wait itself is never swept by the teardown under test.
- **Test cases (7)**:
  - Un-cleared `setInterval` stops ticking after teardown.
  - Pending `setTimeout` is cancelled by teardown.
  - The test file's *own* timers (arguments, `clearTimeout`) continue to work normally.
  - `promisify(environment.global.setTimeout)` still resolves to its value.
  - A `PerformanceObserver` left observing is disconnected by teardown.
  - Stryker `__stryker__` coverage records (created in a foreign realm via `runInNewContext`) are copied into the current realm with prototypes reset to `Object.prototype`.
  - Same for a renamed namespace (`__strykerGlobalNamespace__`); records already in this realm are left untouched.
  - `globalThis.gc` (when present via `--expose-gc`) is called exactly once during teardown.

## Relationships

- **`tests/support/test-environment.ts`** — The module under test; imported as `TestEnvironment` and exercised through its constructor, `setup()`, and `teardown()`.
- **`tests/support/stub.ts`** — Provides `asStub<T>()` to build the minimal constructor-argument objects Jest normally supplies.

## Notes

- All settling uses the **real** `setTimeout` from the outer scope, never `environment.global.setTimeout`, so the test harness itself is never affected by the teardown it is asserting on.
- The Stryker cross-realm test uses `node:vm` `runInNewContext` to faithfully simulate how instrumented code produces objects with a foreign `Object.prototype`—something a plain object literal cannot replicate.
- The GC test temporarily replaces `globalThis.gc` with a `jest.fn()` and restores it afterward; it asserts exactly **one** call, confirming teardown triggers a single collection.
- `asStub` is used purely to satisfy the TypeScript constructor signature; the stubbed fields (`testEnvironmentOptions`, `globals`, `fakeTimers`, `docblockPragmas`) are the only ones `jest-environment-node` actually reads.
