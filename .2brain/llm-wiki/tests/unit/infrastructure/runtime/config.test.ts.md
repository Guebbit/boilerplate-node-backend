---
source: tests/unit/infrastructure/runtime/config.test.ts
sha256: 2fc5885da686ccda912b2ab94333b8b22efca04f2adaedeb30da7030ba9a7fb7
generated_at: 2026-10-15T13:19:05.005834+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/runtime/config.test.ts

## Purpose

Unit tests for the runtime configuration module (`src/infrastructure/runtime/config.ts`). Verifies that every config slice (server, database, cluster, logging) returns correct defaults, parses and validates environment-variable overrides, and rejects malformed values. Also pins down the fail-closed semantics of `isRelaxedEnvironment` and `isTestEnvironment` — an unset or misspelt `NODE_ENV` must never disable safety switches.

## Key elements

- **`withoutEnvironmentInThisFile([...])`** (module-scope call) — strips nine `NODE_*` variables from the process env before any test in this file executes, guaranteeing a clean slate.
- **`describe('isRelaxedEnvironment')`** — asserts the predicate is `true` only for exact `'development'` / `'test'`; `false` for typos, case mismatches, surrounding whitespace, and unset.
- **`describe('isTestEnvironment and nodeEnvironment')`** — confirms `isTestEnvironment()` is exclusive to `'test'` and `nodeEnvironment()` returns the raw string.
- **`describe('the server slice')`** — `serverConfig()`: default port 3000, numeric override, rejection of non-numeric/out-of-range ports, and `NODE_HOST` defaulting to `undefined` (all interfaces).
- **`describe('the database slice')`** — `databaseConfig()`: local-Mongo defaults, blank `NODE_DB_URI` treated as unset, and rejection of non-numeric `NODE_MONGODB_PORT`.
- **`describe('the cluster slice')`** — `clusterConfig()`: clustering off by default, crash limit 10, boolean parsing (`'1'`/`'off'`), and rejection of a zero crash limit.
- **`describe('the logging slice')`** — `loggingConfig()`: `NODE_LOG_PERSONAL_FIELDS` defaults to `'hash'` with whitelist validation; `NODE_LOG_LEVEL` lowercased and validated against known Winston levels.
- **`describe('the helpers restore what they touched')`** — exercises the async `withEnvironment` / `withoutEnvironment` wrappers to confirm they set and then restore the prior value.

## Relationships

- **`src/infrastructure/runtime/config.ts`** — the system under test. The file imports `serverConfig`, `databaseConfig`, `clusterConfig`, `loggingConfig`, `nodeEnvironment`, `isRelaxedEnvironment`, and `isTestEnvironment`.
- **`tests/support/environment.ts`** — provides the environment-manipulation helpers used throughout: `setEnvironment` (sync, no restore), `withEnvironment` / `withoutEnvironment` (async, scoped restore), and `withoutEnvironmentInThisFile` (one-shot module-level strip).

## Notes

- Most tests use the synchronous `setEnvironment` helper; only the final `describe` block exercises the async `withEnvironment`/`withoutEnvironment` pair, which is the pattern needed when the callback returns a `Promise`.
- Validation-error tests assert the thrown message matches a regex containing the variable name (e.g. `/NODE_PORT/`), so renaming a variable in the source will break these tests.
- The `NODE_HOST` "defaults to `undefined`" test is intentional — it documents that omitting the variable means "bind all interfaces," not a bug.
- The fail-closed cases (`'Production'`, `' development'`, `'test '`, unset) are the primary reason this test file exists: they guard against a silent `NODE_ENV` typo leaving every safety switch off in production.
