---
source: src/infrastructure/config/store.ts
sha256: 3c271da4dea2de2b654d4450e9a69e67679952f1b89d66937095fb2337ecd8b0
generated_at: 2026-10-14T07:52:17.041328+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/config/store.ts

## Purpose

Central, process-lifetime store for the application's environment. It reads `process.env` exactly once (freezing a snapshot on first access), layers named overrides on top, resolves `NODE_X_FILE` secret-file indirections, and exposes the merged result to every config slice. State lives on `globalThis` behind a `Symbol.for` key so that Jest's `resetModules()` re-import still finds the same instance.

## Key elements

- **`Environment` / `EnvironmentOverrides`** — public types; a `Record<string, string | undefined>` where `undefined` means "unset".
- **`currentEnvironment()`** — returns the frozen snapshot + overrides + resolved secret files. Rebuilds the merged map only when the internal `version` counter has advanced since the last merge.
- **`environmentVersion()`** — monotonic counter bumped on every mutation; config slices compare it to decide whether their parsed copy is stale.
- **`refreshEnvironment()`** — invalidates the snapshot so the *next* `currentEnvironment()` call re-reads `process.env`. Intended solely for the `.env`-loading path.
- **`overrideEnvironment(entries)`** — applies temporary overrides; returns a restore function that puts each named key back to its exact prior state (including the distinction between "had no override" and "overridden to `undefined`").
- **`installEnvironment(entries)`** — applies overrides with no restore function; used by `createApp({ env })` for the life of the process.
- **`markEnvironmentOverrides()` / `resetEnvironmentOverrides()`** — snapshot-and-restore pair for test harnesses: mark sets a checkpoint, reset refills the overrides `Map` in place back to that checkpoint (preserving the same `Map` reference so earlier undo closures remain valid).
- **`state()`** (internal) — lazily creates the single `StoreState` object on `globalThis[STATE_KEY]`.

## Relationships

- **`./secret-files`** — `currentEnvironment` calls `resolveSecretFiles` *after* merging overrides, so an override can name a secret file and every consumer sees only the resolved value. The resolved value is never written back to `process.env`.
- **`./define`** (`defineConfig`) — config slices call `currentEnvironment` and `environmentVersion` to get their inputs and to know when to re-parse.
- **`./dotenv`** — the `.env` loader mutates `process.env` and then calls `refreshEnvironment` to force a new snapshot.
- **`./fields`** — field definitions are validated against the environment this store exposes.
- **`src/app.ts`** — calls `installEnvironment` during `createApp({ env })` to permanently bind per-app variables.
- **`scenarios/support/*`** and **test files** (`merge.test.ts`, `stock-flag.test.ts`, `schema-contract.test.ts`, etc.) — use `overrideEnvironment` (or `mark`/`reset`) to swap variables per test case without touching the real environment.

## Notes

- The snapshot is frozen on the **first** call to `currentEnvironment`, not at import time. Any `process.env` change before that first call is captured; changes after are invisible until `refreshEnvironment` is called.
- `resetEnvironmentOverrides` mutates the `Map` in place (`clear` + re-fill) rather than replacing it, because undo closures returned by earlier `overrideEnvironment` calls hold a reference to the same `Map`.
- `installEnvironment` is just `overrideEnvironment` with the restore function discarded—there is no separate code path and no way to undo it.
- The `Symbol.for` key (`'boilerplate-node-backend.config.store'`) is the only coordination point between duplicate module instances in a Jest worker; changing the string would silently create a second store.
