---
source: tests/support/environment.ts
sha256: 4b53730b6206ac7f92b24f2fef2135e75448a8ddbb67e30b4deac517765a6a6f
generated_at: 2026-10-29T07:07:35.831255+00:00
model: ollama:qwen3.8:27b
---

# tests/support/environment.ts

## Purpose

Test-helper utilities for controlling environment variables during Jest runs. It wraps the config store's override layer (so modules see changed values without touching `process.env`) and also exposes direct `process.env` mutation for tests that exercise scripts or third-party libraries reading the real environment. Every helper is designed to be safe under `setup-environment-reset.ts`, which calls the appropriate reset at the end of each case.

## Key elements

- **`withEnvironmentOverrides(overrides, body)`** – Applies overrides for the duration of an async `body` callback, then restores. Uses `try/finally` (not `.finally()`) so the restore runs even if `body` throws synchronously. Intended for the module-reload pattern (`jest.resetModules()` + dynamic `import()` inside `body`) when a value is captured at import time.
- **`withoutEnvironmentInThisFile(keys)`** – Registers a `beforeEach` that unsets the listed keys for every case in the file. Use for files that test "no configuration was set" scenarios or suites that drive values case-by-case.
- **`setEnvironment(overrides)`** – Applies overrides for the remainder of the current case. `undefined` unsets a key. For varying a setting across multiple statements without the nesting a `withEnvironmentOverrides` body would add.
- **`resetEnvironment()`** – Drops all overrides applied so far in the current case, reverting to the worker's original values.
- **`setProcessEnvironment(overrides)`** – Writes directly to `process.env` (bypasses the config store). For subjects that read `process.env` themselves (e.g. `scripts/`, `mongodb-memory-server`). Records originals in an internal `Map` on first touch.
- **`restoreProcessEnvironment()`** – Reverts every prior `setProcessEnvironment` call; distinguishes "variable was absent" from "variable was empty."
- **`unset(keys)`** *(internal)* – Builds a `Record<string, undefined>` from a list of key names.

## Relationships

- **`src/infrastructure/config/store.ts`** – Source of `overrideEnvironment`, `resetEnvironmentOverrides`, and the `EnvironmentOverrides` type. All config-store-based helpers in this file delegate to those functions; they never mutate `process.env`.
- **Account contract tests** (`api.contract.test.ts`, `code-delivery.contract.test.ts`, `reauth.contract.test.ts`, `two-factor.contract.test.ts`) and **integration tests** (`auth-hardening`, `cookie-hardening`, `email-change-ttl`, `export`, `idle-timeout`, `jobs`, `jwt`, `login-consent`, `mail-recipient-budget`, `oauth-links`) – Consumers. They import these helpers to set or clear environment variables per suite or per case.

## Notes

- Overrides target the config store's override layer, **not** `process.env`. The store reads the process environment once at startup, so only an override can change what a slice sees.
- `setProcessEnvironment` is the exception: it touches the real `process.env` and is invisible to the config store. Use it only when the subject under test reads `process.env` directly.
- Restoration distinguishes "removed" (`Reflect.deleteProperty`) from "set to empty string." A reader that checks `env.FOO === undefined` behaves differently from one that checks `env.FOO === ''`.
- `processOriginals` is a module-level `Map`; "first touch wins" means calling `setProcessEnvironment` twice for the same key only records the original value on the first call.
