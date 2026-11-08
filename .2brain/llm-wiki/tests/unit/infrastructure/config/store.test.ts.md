---
source: tests/unit/infrastructure/config/store.test.ts
sha256: 4f0b4c0db3985161db9cec688611f4d575b8580a87c79a04d9c96f22e9f7a663
generated_at: 2026-11-08T10:12:16.621697+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/config/store.test.ts

## Purpose

Unit tests for the environment store (`src/infrastructure/config/store.ts`). Validates the store's contract: a read-once snapshot of `process.env`, an override layer that wins over the snapshot, a monotonically increasing version counter that moves only when observable reads could change, and the undo / mark / reset semantics that govern the override layer.

## Key elements

- **`NAME`** — a sentinel variable (`NODE_STORE_TEST_VARIABLE`) no real environment sets, guaranteeing every assertion starts from "absent".
- **`afterEach`** — deletes the store's global slot (`Symbol.for('boilerplate-node-backend.config.store')`) so each case starts with a fresh store instance.
- **Read-once tests** — confirm a later write to `process.env` is invisible after the first read; a write made *before* the first read is visible.
- **`refreshEnvironment` test** — confirms the snapshot is re-taken only on explicit refresh.
- **Identity / freeze tests** — `currentEnvironment()` returns the same object reference until a change, and the returned object is frozen.
- **Override tests** — override wins over snapshot; `undefined` override hides the key entirely (treated as "unset"); overrides never write back to `process.env`.
- **Version tests** — `environmentVersion()` is unchanged by a plain read, bumps on each mutation (override, restore).
- **Undo (restore) tests** — removing a never-set key, restoring a prior override value, and restoring an "unset" override all behave per contract.
- **Mark / reset tests** — `markEnvironmentOverrides` snapshots the override layer; `resetEnvironmentOverrides` rewinds to that mark rather than clearing everything.
- **`installEnvironment` test** — installed overrides persist until a reset removes them.
- **Registry-reset test** — after `jest.resetModules()` + re-import, the new module instance sees the same override state (state lives on the global symbol, not module scope).

## Relationships

- **`src/infrastructure/config/store.ts`** — the system under test. All exported functions (`currentEnvironment`, `environmentVersion`, `installEnvironment`, `markEnvironmentOverrides`, `overrideEnvironment`, `refreshEnvironment`, `resetEnvironmentOverrides`) are exercised here.
- **`tests/support/environment.ts`** — provides `setProcessEnvironment`, the helper used to mutate `process.env` in a controlled, restorable way between test cases.

## Notes

- The `afterEach` cleanup intentionally also removes the worker-harness mark on the same global symbol; the test file does not depend on that mark, so this is safe.
- The "registry reset" test uses a dynamic `import()` after `jest.resetModules()` to prove state survives re-import — this is the mechanism that lets a fresh module instance read the same overrides stored on `globalThis`.
- `undefined` overrides are semantically distinct from "key absent from the override object": they actively hide the snapshot value. Tests assert with `'KEY' in obj` (not just a value check) to pin this distinction.
