---
source: tests/support/environment.ts
sha256: 4b53730b6206ac7f92b24f2fef2135e75448a8ddbb67e30b4deac517765a6a6f
generated_at: 2026-11-08T09:54:10.891569+00:00
model: ollama:qwen3.8:27b
---

# tests/support/environment.ts

## Purpose

Test-only helpers that let test files set, unset, and restore configuration variables without polluting `process.env` (or the config store) beyond the scope of a single case or file. It wraps the config store's override layer for the common case and exposes a separate `process.env` path for the few subjects (scripts, native libraries) that read the real environment directly.

## Key elements

- **`withEnvironmentOverrides(overrides, body)`** — Runs `body` with the given variable overrides active, then restores the previous state in a `finally` block. The canonical scoped helper for "I need a different value inside this one assertion."
- **`withoutEnvironmentInThisFile(keys)`** — Registers a `beforeEach` that unsets the listed keys for every case in the calling file. Used when the worker environment (set by `setup-environment.ts`) can no longer express "nothing configured."
- **`setEnvironment(overrides)`** — Applies overrides for the remainder of the current case; cleaned up by `setup-environment-reset.ts`. For cases that vary a setting across multiple statements.
- **`resetEnvironment()`** — Drops every override made so far in the current case, reverting to the worker's starting values.
- **`setProcessEnvironment(overrides)`** — Writes the real `process.env` (first-touch-wins tracking in a module-level `Map`). For subjects that bypass the config store (e.g. `mongodb-memory-server`, `scripts/`).
- **`restoreProcessEnvironment()`** — Undoes all `setProcessEnvironment` calls, restoring original values or re-deleting keys that were absent.
- **`unset(keys)`** (private) — Builds a `Record<string, undefined>` mapping each key to `undefined`, the convention for "remove this variable."

## Relationships

- **`src/infrastructure/config/store.ts`** — Sole import source. Provides `overrideEnvironment`, `resetEnvironmentOverrides`, and the `EnvironmentOverrides` type. All config-store-level helpers in this file delegate to those three exports.
- **Contract tests** (`api.contract.test.ts`, `code-delivery.contract.test.ts`, `reauth.contract.test.ts`, `two-factor.contract.test.ts`) — Consume `withoutEnvironmentInThisFile` and/or `withEnvironmentOverrides` to isolate per-case configuration.
- **Integration tests** (`auth-hardening`, `cookie-hardening`, `email-change-ttl`, `export`, `idle-timeout`, `jobs`, `jwt`, `login-consent`, `mail-recipient-budget`, `oauth-links`) — Use `setEnvironment`, `withEnvironmentOverrides`, and `resetEnvironment` to drive configuration case-by-case.
- **`tests/support/setup-environment.ts`** (referenced in docs, not in graph) — Seeds the worker's baseline values; this file's overrides layer on top of that baseline.
- **`tests/support/setup-environment-reset.ts`** (referenced in docs, not in graph) — Jest `afterEach` hook that calls `resetEnvironmentOverrides` and `restoreProcessEnvironment` to clean up after every case.

## Notes

- Overrides go through the config store's override layer, **not** `process.env`. The store reads `process.env` once at import time, so only the override layer can change what a slice sees mid-test.
- `setProcessEnvironment` / `restoreProcessEnvironment` is the **only** path that touches the real `process.env`. Use it only for subjects that read `process.env` directly.
- "Unset" means mapping a key to `undefined` in the overrides record; it does **not** mean setting the value to an empty string. For `process.env`, unset deletes the property via `Reflect.deleteProperty`.
- `withEnvironmentOverrides` is the preferred form when a module captures a value at import time (e.g. a rate limiter's budget): call `jest.resetModules()` and a dynamic `import()` inside `body` to get a fresh instance with the new environment.
- The `finally` in `withEnvironmentOverrides` is deliberate: restoration must run on resolve, reject, **and** synchronous throw.
