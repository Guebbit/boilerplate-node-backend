---
source: tests/unit/infrastructure/config/secret-files.test.ts
sha256: 8925148aef53f69a5714f734209374bc1f5d919e5f5ca56007f63e5bc3c12f1a
generated_at: 2026-11-08T10:12:07.169477+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/config/secret-files.test.ts

## Purpose

Unit tests for `resolveSecretFiles`, the loader that maps `NODE_X_FILE` variables to their `NODE_X` counterparts by reading a file, and that merges a resolved password into its sibling connection URL. The file pins down the loader's contract: file content wins over the plain variable, the input object is never mutated, only `NODE_*` names are touched, secrets never leak into error messages, and no value is written back to `process.env`.

## Key elements

- **`secretFile(name, content)`** – local helper that writes `content` into the case's temp directory and returns the absolute path.
- **`describe('resolveSecretFiles')`** – core resolution tests: reading, single-trailing-newline stripping, file-over-env precedence, empty-file-as-unset, blank-value skipping, non-`NODE_` names left alone, error format (name + path, no secret), and input immutability.
- **`describe('a password merged into its URL')`** – parameterised and single tests covering: password injection for `NODE_DB_URI`, `NODE_REDIS_URL`, `NODE_RABBITMQ_URL`, `NODE_RATE_LIMIT_REDIS_URL`; user preservation; empty-user (`:pass@`) form; replacement of an existing password; percent-encoding of special characters; multi-host Mongo URIs (bypassing WHATWG `URL`); `mongodb+srv://`; unparseable-URL pass-through; no-password / no-URL no-ops; and password-from-file feeding the merge.
- **`describe('through the config store')`** – one integration-style test that calls `setEnvironment`, then asserts `databaseConfig().NODE_DB_URI` carries the merged password, `currentEnvironment()` exposes it, and `process.env` stays clean.

## Relationships

- **`src/infrastructure/config/secret-files.ts`** — module under test; provides `resolveSecretFiles`.
- **`src/infrastructure/config/store.ts`** — provides `currentEnvironment`, used in the config-store test to verify the resolved slice is visible through the store.
- **`src/infrastructure/runtime/config.ts`** — provides `databaseConfig`, the public accessor whose `NODE_DB_URI` the store test asserts on.
- **`tests/support/environment.ts`** — provides `setEnvironment`, used to seed `NODE_*` variables for the store test without directly mutating `process.env`.

## Notes

- Only **one** trailing `\n` is stripped; any additional newlines or leading/trailing spaces are preserved verbatim in the resolved value.
- Multi-host Mongo URIs (e.g. `mongodb://a:27017,b:27017/…`) cannot be parsed by `new URL()`; the implementation handles them with its own logic, and the tests lock that in.
- Error messages are constrained to `NODE_X_FILE: cannot read the secret file <path> (errno)` — the secret value must never appear.
- The module-level `directory` is managed by `beforeEach`/`afterEach` in the first two `describe` blocks, but the last test in the URL block and the store block each create their **own** `mkdtempSync` directory with a local `try/finally` cleanup, slightly breaking the uniform pattern.
- Passwords are percent-encoded (`p@ss w/rd:` → `p%40ss%20w%2Frd%3A`) before being inserted into the URL authority.
