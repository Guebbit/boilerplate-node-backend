---
source: tests/unit/infrastructure/config/secret-files.test.ts
sha256: 18a97bf3df896c80696c59852a0bd41d7db6a4242256a0ae3047c988078af4b9
generated_at: 2026-10-15T13:10:30.833513+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/config/secret-files.test.ts

## Purpose

Unit tests for `resolveSecretFiles`, the loader that turns `NODE_X_FILE` environment variables into their `NODE_X` counterparts and merges `NODE_X_PASSWORD` values into connection URLs. The suite locks down the loader's contract: file value wins over the inline variable, only a single trailing newline is stripped, the function never mutates its input or `process.env`, and a secret value never leaks into an error message.

## Key elements

- **`secretFile(name, content)`** – local helper that writes a file into the per-case temp directory and returns its absolute path.
- **`describe('resolveSecretFiles', …)`** – core resolution rules: newline stripping, edge-whitespace preservation, file-over-env precedence, empty-file-as-unset, blank `*_FILE` ignored, non-`NODE_` names (e.g. `GIT_INDEX_FILE`) left untouched, read-error message names the variable and path but not the value, input object immutability.
- **`describe('a password merged into its URL', …)`** – parameterised tests (`it.each`) over Mongo, Redis, RabbitMQ, and rate-limit Redis URLs covering: password injection (including URL-encoding special characters), user preservation, empty-user (`:pass@`) form for Redis, replacement of an existing password, multi-host Mongo and `mongodb+srv` URIs (which the WHATWG `URL` parser rejects), AMQP escaping, unparseable-URL passthrough, no-op when no URL or no password is present, and reading the password from a `*_FILE` rather than an inline value.
- **`describe('through the config store', …)`** – integration check that `databaseConfig()` from the runtime config layer returns the resolved URL while `process.env` remains clean and `currentEnvironment()` holds the resolved password.

## Relationships

- **`src/infrastructure/config/secret-files.ts`** – the module under test; exports `resolveSecretFiles`, the only function exercised by every `it` block.
- **`src/infrastructure/config/store.ts`** – provides `overrideEnvironment` (to inject a fake env slice) and `currentEnvironment` (to assert the store's view) in the config-store describe block.
- **`src/infrastructure/runtime/config.ts`** – provides `databaseConfig`, the runtime accessor used to verify the end-to-end resolved URL without touching `process.env` directly.

## Notes

- Each test case gets its own `mkdtempSync` directory (created in `beforeEach`, removed in `afterEach`). The "takes the password from a file" test and the config-store test create *additional* temp directories inline rather than reusing the shared one; clean up is in a `try/finally` or `afterEach` respectively.
- The function is strictly pure with respect to its input object and `process.env`; the suite asserts this explicitly rather than relying on side-effect absence.
- Multi-host Mongo URIs (`mongodb://api@a:27017,b:27017/…`) cannot be parsed by WHATWG `URL`; the implementation (and this test) confirms a custom parser handles them while still percent-encoding the injected password.
- An empty file (content is only `\n`) is treated as "unset," not as an empty-string override—this is a deliberate design choice locked in by a dedicated test.
