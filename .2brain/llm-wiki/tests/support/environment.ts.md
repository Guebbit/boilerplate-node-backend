---
source: tests/support/environment.ts
sha256: ebdeaef6705ec6fdd4559aafe956708e0350679e3b4b61ffe255f7fbfea00942
generated_at: 2026-10-15T12:57:54.750830+00:00
model: ollama:qwen3.8:27b
---

# tests/support/environment.ts

## Purpose

Test-support utilities that manage environment-variable overrides scoped to individual cases, the remainder of a case, or an entire test file. They write to the config store's override layer (not `process.env`) so that slices re-read configuration through the real parser, and guarantee restoration via `finally` or Jest hooks so one case's setup never leaks into the next.

## Key elements

- **`withEnvironment(key, value, body)`** — Run an async body with a single variable set; restores afterwards.
- **`withEnvironmentOverrides(overrides, body)`** — Same idea for multiple variables; additionally **returns** `body`'s resolved value so callers can do `jest.resetModules()` + dynamic `import()` inside `body` and receive the fresh module instance. Uses `try/finally` so restore runs on resolve, reject, or synchronous throw.
- **`withoutEnvironment(keys, body)`** — Unset a set of variables (override to `undefined`) for the duration of `body`.
- **`withoutEnvironmentInThisFile(keys)`** — Registers `beforeEach`/`afterEach` hooks so the listed keys are unset for every case in the file; intended for suites whose subject *is* the configuration.
- **`setEnvironment(overrides)`** — Fire-and-forget: sets (or unsets, when value is `undefined`) overrides for the rest of the caller's scope; pair with `resetEnvironment`.
- **`resetEnvironment()`** — Drops every override the file has made, returning all variables to the worker's starting values.
- **`setProcessEnvironment(overrides)`** — Writes the **real** `process.env` (for scripts under `scripts/` or libraries like `mongodb-memory-server` that bypass the config store). Tracks originals in a module-level `Map`; `undefined` removes the key.
- **`restoreProcessEnvironment()`** — Reverses every `setProcessEnvironment` call; restores removed keys to absent rather than empty.

## Relationships

- **`src/infrastructure/config/store.ts`** — Source of `overrideEnvironment`, `resetEnvironmentOverrides`, and the `EnvironmentOverrides` type. Every config-store override in this file routes through that module's API.
- **All listed account test files** (contract, integration) — Import the helpers above to drive configuration per case without touching `process.env` directly.
- **`tests/support/setup-environment.ts`** (referenced in JSDoc) — Populates the worker's baseline env before any test file runs; the helpers here layer on top of and restore to that baseline.
- **`setup-environment-reset.ts`** (referenced in JSDoc) — File-level cleanup that calls `restoreProcessEnvironment` after each case.

## Notes

- Overrides target the config store's override layer, **not** `process.env`. The store snapshots the process environment at import time, so only the override mechanism can change what a slice sees mid-test.
- `withEnvironmentOverrides` deliberately returns `body`'s value (typed `<T>`) to support the "reload module under a new config" pattern; the `void`-returning siblings do not.
- `setProcessEnvironment` records the original value on **first touch only** (first-wins `Map`), so repeated sets within one case don't clobber the restore target.
- `withoutEnvironmentInThisFile` depends on Jest's `beforeEach`/`afterEach` being in scope at the call site — it is a plain function, not a hook itself.
- Distinguishing "removed" from "empty string" in `process.env` restoration matters to consumers that check key existence vs. value.
