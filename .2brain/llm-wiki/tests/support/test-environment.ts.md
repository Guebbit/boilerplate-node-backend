---
source: tests/support/test-environment.ts
sha256: be05b1034553592cc92080ace403e20ec21ee55c3e861dd6a9b0240d3e2f923e
generated_at: 2026-09-23T20:15:02.076721+00:00
model: ollama:qwen3.8:27b
---

# tests/support/test-environment.ts

## Purpose

Custom Jest environment (extends `jest-environment-node`) that tracks every `setTimeout`/`setInterval` timer and every `PerformanceObserver` a test file creates, then clears/disconnects them at teardown. It exists because a live callback pins the entire VM context (app, models, all loaded modules) to memory—35–80 MB per file. Jest's worker recycling hides the leak in normal runs, but Stryker's `runInBand` mode has no recycling, so an unmanaged dry run grows until the heap limit kills it.

## Key elements

- **`TestEnvironment`** (default export) — extends `NodeEnvironment`. In `setup()`, points the process-wide observer registry at the file's set. In `teardown()`, clears pending timers, disconnects observers, restores the previous registry slot, then delegates to the base class.
- **`tracked(start, pending, oneShot)`** — wraps `setTimeout`/`setInterval` so each created timer is added to a `Set`; one-shot timers self-remove from the set when they fire (so high-frequency sources like the MongoDB driver don't accumulate).
- **`untracking(cancel, pending)`** — wraps `clearTimeout`/`clearInterval` to remove the timer from the tracking set before calling the real cancel.
- **`installObserverRegistry()`** — patches `PerformanceObserver.prototype.observe` once per process (guarded by `Symbol.for`), recording each observer into a shared `ObserverRegistry` slot. Returns the single registry instance.
- **`observerRegistry`** — module-level singleton created by the above; one slot suffices because one file runs at a time per process.
- **`withOwnProperties(wrapper, original)`** — copies own properties (notably `util.promisify.custom`) from the original timer function onto the wrapper so `promisify(setTimeout)` still resolves to Node's promise form.
- **`REGISTRY`** (`Symbol.for('tests/support/test-environment#observers')`) — stable key on `PerformanceObserver.prototype` so a second copy of this module (e.g. loaded through Jest's own registry) reuses the first copy's patch instead of stacking.
- **`isRegistry`** — type guard narrowing the prototype property to `ObserverRegistry`.

## Relationships

- **`github/workflows/mutation.yml`** — Stryker's `runInBand` configuration is the primary motivation for this file: without per-file teardown, leaked intervals (e.g. `express-rate-limit` MemoryStore) and observers (e.g. prom-client `collectDefaultMetrics`) accumulate across files in a single process.
- **`tests/unit/support/test-environment.test.ts`** — unit tests that exercise the tracking, untracking, and observer-registry logic in isolation.

## Notes

- The `Symbol.for` guard means the `observe` patch is installed exactly once per process, even if Jest's module registry loads a second copy of this file. A naive re-import would otherwise stack a second wrapper.
- `previousObservers` supports a narrow edge case: an environment constructed _inside_ a test file (e.g. `new TestEnvironment(...)`) will, at its own teardown, hand the registry slot back to the outer file's set.
- Timer tracking relies on `NodeJS.Timeout` _objects_ in the set; `clearTimeout`/`clearInterval` may also accept a numeric/string id, which the `untracking` wrapper explicitly ignores (only object handles are in the set).
- `perf_hooks` is a Node core module—every file in a process shares one `PerformanceObserver` prototype—so the patch is process-global. Timer globals, by contrast, are per-file in Jest's sandbox, so they are wrapped per-constructor.
- The file imports types via `ConstructorParameters<typeof NodeEnvironment>` rather than from `@jest/environment`, which is not a declared dependency of this repo.
