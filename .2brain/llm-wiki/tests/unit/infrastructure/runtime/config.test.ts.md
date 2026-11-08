---
source: tests/unit/infrastructure/runtime/config.test.ts
sha256: 02256d7c19e4bc962db96dc313caea0689f050ce52b60de82662c2c5d809f5ca
generated_at: 2026-11-08T10:23:18.932176+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/runtime/config.test.ts

## Purpose

Unit tests for the runtime configuration module. They verify that each config slice (`serverConfig`, `databaseConfig`, `clusterConfig`, `loggingConfig`) returns correct defaults, parses environment overrides, and rejects invalid values with a descriptive error. A dedicated block ensures `isRelaxedEnvironment` is **strict** for any typo, misspelling, case variation, or unset `NODE_ENV`—the silent failure mode the function exists to prevent.

## Key elements

- **`describe('isRelaxedEnvironment')`** — asserts `true` only for exact `'development'` / `'test'`; `false` for `'production'`, `'staging'`, case mismatches, padded whitespace, and unset `NODE_ENV`.
- **`describe('isTestEnvironment and nodeEnvironment')`** — confirms `isTestEnvironment` is true only for exact `'test'`; `nodeEnvironment` echoes the raw value.
- **`describe('the server slice')`** — default port `3000`, override via `NODE_PORT`, rejection of out-of-range or non-numeric ports, and that `NODE_HOST` is `undefined` by default (binds all interfaces).
- **`describe('the database slice')`** — default host/port/dbname; blank `NODE_DB_URI` treated as unset (enables container-mode `npm run host`); invalid `NODE_MONGODB_PORT` throws.
- **`describe('the cluster slice')`** — clustering off by default with crash limit `10`; accepts `'1'`/`'off'` switch vocabularies; crash limit of `0` is rejected.
- **`describe('the logging slice')`** — personal-field mode defaults to `'hash'`; only the three known modes accepted; log level read case-insensitively but must be a valid Winston level.

## Relationships

- **`src/infrastructure/runtime/config.ts`** — the module under test. Every `it` block calls one of its exported functions and asserts on the returned object or thrown error.
- **`tests/support/environment.ts`** — provides `withoutEnvironmentInThisFile` (clears the listed `NODE_*` vars once at file scope so no parent environment leaks in) and `setEnvironment` (sets a single var for the duration of one test).

## Notes

- `withoutEnvironmentInThisFile` is called at module top-level, **before** any `describe`, guaranteeing a clean slate regardless of CI shell state.
- Tests that expect a throw assert on a regex (`/NODE_PORT/`, etc.), coupling them to the error-message format in `config.ts`. Renaming a variable in the source will break the test.
- The "blank URI = unset" test documents an intentional convention: `NODE_DB_URI=''` is equivalent to not setting it, which is the mechanism that lets `npm run host` fall through to the container default.
- The relaxed-environment tests are exhaustive on the **negative** side (many strict cases) because the cost of a false `true` is that every safety switch silently turns off.
