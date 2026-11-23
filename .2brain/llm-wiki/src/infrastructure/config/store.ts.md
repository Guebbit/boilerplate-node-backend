---
source: src/infrastructure/config/store.ts
source_sha256: d62104e72ebf6a06005afc8195f012b2dedc360a28b938e4ab03f5f0e4bfc973
context_sha256: e596008eb4e729b18b473b064224d054072b09d45b2b6fcd27d560dda04d076d
generated_at: 2026-11-22T02:46:59.756219+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/config/store.ts

## Purpose
The single place the process environment is read and the single place it can be overridden. It freezes a snapshot of `process.env` on first read, layers overrides on top, resolves `NODE_X_FILE` secret-file variables, and caches the merged result. Config slices read from here rather than touching `process.env` directly.

## Key elements
- `Environment` / `EnvironmentOverrides` — readonly name→value record types; in overrides, `undefined` means "unset this variable".
- `currentEnvironment()` — returns the effective environment (snapshot + overrides, then `resolveSecretFiles`), frozen. The same object is returned until the version changes.
- `environmentVersion()` — a counter that changes whenever the environment's values could differ; slices use it to know their parsed copy is stale.
- `refreshEnvironment()` — discards the snapshot so the next read re-copies `process.env`, and bumps the version. Meant for loading `.env` after startup.
- `overrideEnvironment(entries)` — sets overrides and returns an undo function that restores each named variable's prior override state.
- `installEnvironment(entries)` — same as `overrideEnvironment` but discards the undo; used for `createApp({ env })`.
- `markEnvironmentOverrides()` — records the current overrides as the reset target.
- `resetEnvironmentOverrides()` — restores overrides to the last mark (or empty if none was set) and bumps the version.

## Relationships
- Imports `resolveSecretFiles` from `secret-files.ts`, which turns `NODE_X_FILE` into `NODE_X` when the merged environment is built.
- The header names `defineConfig` slices (`define.ts`) as consumers: slices call `currentEnvironment()` and use `environmentVersion()` to invalidate parsed copies.
- Per the header, `createApp({ env })` (`src/app.ts`) installs overrides via `installEnvironment`, and test helpers use the override/mark/reset functions.
- `dotenv.ts` is the `.env` loading path that `refreshEnvironment` exists for.

## Notes
- State lives on `globalThis` under `Symbol.for('boilerplate-node-backend.config.store')`, so a `jest.resetModules()` re-import still sees the same store.
- The snapshot is taken at the first read. Later changes to `process.env` are not seen unless `refreshEnvironment()` is called.
- Resolved secret-file values are never written back to `process.env`. They are resolved after overrides, so an override can name a secret file.
- Overrides are tracked per name, so "no override" and "overridden to `undefined`" are different states. Undo functions restore that distinction.
- `resetEnvironmentOverrides` refills the existing `overrides` Map in place, because undo functions handed out earlier hold that Map.
- `installEnvironment` has no way back.
