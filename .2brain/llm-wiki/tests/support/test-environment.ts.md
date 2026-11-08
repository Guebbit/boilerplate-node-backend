---
source: tests/support/test-environment.ts
sha256: d321f600dd2b85fa6cf33d622fc9983c7af1085ba88c3ed8a2d880dfe0377f64
generated_at: 2026-11-08T10:01:44.169308+00:00
model: ollama:qwen3.8:27b
---

# tests/support/test-environment.ts

## Purpose

Custom Jest test environment (extends `jest-environment-node`) that prevents a finished test file from keeping its entire VM context alive. It tracks and clears leftover `setTimeout`/`setInterval` calls and `PerformanceObserver` instances at teardown, moves Stryker mutation-coverage records out of the file's realm, forwards host-process `warning` events into the file, and optionally triggers `global.gc()` (under `--expose-gc`) so the context is actually collected before the next file starts.

## Key elements

- **`TestEnvironment`** (default export) — the environment class. Wraps `setTimeout`/`setInterval` with tracking, patches `PerformanceObserver.prototype.observe` via a process-wide registry, and in `teardown()` clears pending timers, disconnects observers, releases Stryker coverage, restores the observer registry slot, and calls `gc` when available.
- **`tracked(start, pending, oneShot)`** — wraps a timer starter so each started timer is added to a `Set`; one-shot timers are removed on fire.
- **`untracking(cancel, pending)`** — wraps `clearTimeout`/`clearInterval` so a cleared timer is removed from the tracked set.
- **`installObserverRegistry()`** — patches `PerformanceObserver.prototype.observe` once per process (keyed by `Symbol.for`) to record each observer into a shared registry; only one slot exists because a process runs one file at a time.
- **`releaseStrykerCoverage(global)`** — copies Stryker's `mutantCoverage` records (created in the test file's VM context) into objects in this module's realm, breaking the reference that pins the file's context alive.
- **`withOwnProperties(wrapper, original)`** — copies own properties (notably `util.promisify.custom`) from the original timer function onto the tracking wrapper so `promisify` still resolves correctly.
- **`inThisRealm(record)`** — returns the record as-is if it belongs to this realm, otherwise spreads it into a new object here.
- **`forwardWarning`** (instance method) — re-emits host-process `'warning'` events onto the file's `process` object (Jest's `process` is a separate copy with its own listener list).

## Relationships

- **`tests/unit/support/test-environment.test.ts`** — unit tests that import `TestEnvironment` directly (through Jest's module registry, so the `Symbol.for` observer patch resolves to the same instance rather than stacking a second patch). Exercises the timer-tracking wrappers, the observer registry, and the Stryker coverage release logic in isolation.

## Notes

- The `Symbol.for('tests/support/test-environment#observers')` key ensures idempotent patching: a second copy of this module (e.g. loaded by a test) reuses the existing registry instead of overriding the `observe` patch.
- `previousObservers` is saved/restored around each file's lifetime so that an environment constructed *inside* a test file (e.g. by the unit test) hands the registry slot back to the outer file at its teardown.
- The Stryker coverage release is a no-op outside a `perTest`-coverage dry run; it looks up the namespace name from `__strykerGlobalNamespace__` (falls back to `__stryker__`).
- Timer tracking uses a `Set<NodeJS.Timeout>`; numeric/string timer IDs passed to `clearTimeout`/`clearInterval` are explicitly excluded from the set (only `Timeout` objects are ever added).
- `global.gc` is only invoked when the `--expose-gc` flag made it available; normal (non-mutation) runs pay no cost.
