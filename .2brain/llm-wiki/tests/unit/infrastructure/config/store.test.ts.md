---
source: tests/unit/infrastructure/config/store.test.ts
sha256: 4f0b4c0db3985161db9cec688611f4d575b8580a87c79a04d9c96f22e9f7a663
generated_at: 2026-10-15T13:10:42.378626+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/config/store.test.ts

## Purpose

Unit tests for the config store contract: a once-read snapshot of `process.env`, an override layer that wins and round-trips exactly, and a monotonically increasing version that moves only when a read's result could change.

## Key elements

- **`afterEach` cleanup** — Deletes the store's slot from `globalThis` via `Symbol.for('boilerplate-node-backend.config.store')`, ensuring no state leaks between cases.
- **Snapshot-once tests** — Verify that `currentEnvironment()` captures `process.env` at first read and ignores later writes, but re-snapshots after `refreshEnvironment()`.
- **Identity & frozen tests** — Confirm `currentEnvironment()` returns the *same* object reference until something changes, and that the returned object is `Object.isFrozen`.
- **Override tests** — `overrideEnvironment` wins over the snapshot; an `undefined` value means "remove the key"; overrides never mutate `process.env`.
- **Version tests** — `environmentVersion()` is invariant across reads but strictly increases after every override or restore.
- **Undo (restore) tests** — The function returned by `overrideEnvironment` reverts to the *previous override* (not the snapshot), including the "unset" case.
- **Mark / reset tests** — `markEnvironmentOverrides` sets a checkpoint; `resetEnvironmentOverrides` restores to that checkpoint rather than to empty.
- **`installEnvironment` test** — Overrides set this way persist until a reset removes them.
- **Registry-reset test** — Uses `jest.resetModules()` + dynamic `import` to prove state survives a full module re-evaluation (stored on `globalThis`, not module scope).
- **`setProcessEnvironment`** (from `@tests/environment`) — Helper that writes to `process.env` for controlled test setup.
- **`NODE_STORE_TEST_VARIABLE`** — Deliberately fake variable name guaranteeing no real environment value interferes.

## Relationships

- **`src/infrastructure/config/store.ts`** — The module under test. Every export (`currentEnvironment`, `environmentVersion`, `installEnvironment`, `markEnvironmentOverrides`, `overrideEnvironment`, `refreshEnvironment`, `resetEnvironmentOverrides`) is exercised here.
- **`tests/support/environment.ts`** — Provides `setProcessEnvironment`, the helper used to seed `process.env` before or after the first read.

## Notes

- The store keeps its state on `globalThis` under a well-known `Symbol`, so the `afterEach` must delete that exact symbol. Forgetting this (or the symbol name changing) silently breaks isolation.
- `resetEnvironmentOverrides` restores to the **last mark**, not to an empty object. If no mark was set, it clears all overrides.
- `overrideEnvironment` is non-destructive: it returns a restore closure rather than mutating in place, enabling nested overrides.
- The registry-reset test is the only one that does a dynamic `import`; it verifies the globalThis-based design, not the module's internal closure state.
