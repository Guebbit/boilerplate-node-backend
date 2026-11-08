---
source: tests/unit/support/test-environment.test.ts
sha256: 7952d10e6742a1ea7b8ebb560fbebf3af9b07ca45e0184b8fbd1602b27dda32d
generated_at: 2026-11-08T10:45:01.822469+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/support/test-environment.test.ts

## Purpose

Unit tests for the custom Jest environment (`TestEnvironment`). Each case builds a real environment, registers a timer/observer/record through it, calls `teardown()`, and asserts the registration is gone—verifying that nothing a test file left behind keeps running or pinning the VM context in memory. Additional cases cover Stryker coverage-record realm migration and optional GC collection.

## Key elements

- **`createEnvironment`** — instantiates `TestEnvironment` with minimal `asStub`-based constructor args, awaits `setup()`, and returns the ready instance.
- **`settle(ms)`** — a `setTimeout`-based delay that runs on the *host* clock (not the environment's fake timers), so it is never itself swept by teardown. Defaults to `SETTLE_MS` (40 ms).
- **`EnvironmentArguments`** — type alias (`ConstructorParameters<typeof TestEnvironment>`) for the two-arg constructor signature.
- **Test cases** (one `describe('TestEnvironment')`):
  - Interval created via the environment stops firing after teardown.
  - A pending `setTimeout` is cancelled at teardown.
  - Host-level `setTimeout`/`clearTimeout` remain functional; args are passed through.
  - `promisify(environment.global.setTimeout)` still resolves to its argument.
  - A `PerformanceObserver` created in host code is disconnected at teardown (marks after teardown are not observed).
  - Stryker's `__stryker__.mutantCoverage` (built in another VM realm via `runInNewContext`) is copied into the test realm with intact values and `Object.prototype` prototypes.
  - A coverage record already in the local realm is left untouched; a renamed namespace (`__strykerGlobalNamespace__`) is honoured.
  - `globalThis.gc` is called exactly once at teardown (requires `--expose-gc`).

## Relationships

- **`tests/support/test-environment.ts`** — the class under test; imported as `TestEnvironment` and exercised via `setup()` / `teardown()` / `.global`.
- **`tests/support/stub.ts`** — provides `asStub`, used to build the minimal constructor-argument objects without a real Jest config.

## Notes

- `settle()` intentionally uses the host's `setTimeout`, not the environment's, so the waiting itself is not subject to the teardown it is verifying.
- The Stryker cross-realm test uses `node:vm`'s `runInNewContext` to faithfully reproduce how instrumented code creates coverage records in a separate realm.
- The GC test mutates `globalThis.gc` and restores it in the same `it`; running the suite without `--expose-gc` means `gc` is `undefined` and the test will fail (the `jest.fn()` replaces it regardless, so it always passes in isolation—but the comment implies the flag is the intended trigger).
- `asStub` is used purely to satisfy the constructor's type signature; no real Jest config behaviour is exercised here.
