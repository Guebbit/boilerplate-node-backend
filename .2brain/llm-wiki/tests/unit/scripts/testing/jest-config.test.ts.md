---
source: tests/unit/scripts/testing/jest-config.test.ts
sha256: 20da46b1165cab3865431ef22ba2bbb17de1cd6a81e367d9328a3ed366b8862c
generated_at: 2026-11-08T10:43:27.500275+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scripts/testing/jest-config.test.ts

## Purpose

Verifies that the repository's Jest configuration files set `workerIdleMemoryLimit` correctly as a function of the worker count. Because Jest treats an undefined limit as a signal to run a single worker in-band, the tests pin down when that field is present versus absent across `jest.config.js` and `jest.config.mutation.js`.

## Key elements

- **`WorkerSettings`** — minimal interface (`maxWorkers`, optional `workerIdleMemoryLimit`) describing the slice of config the tests assert on.
- **`loadWith(file, workers)`** — sets `JEST_WORKERS` in the process environment, then uses `jest.isolateModules` to `require` the target config fresh so its top-level code re-runs against the new value. Returns the config's worker settings.
- **`describe('jest.config.js worker recycle limit')`** — three cases:
  - Limit matches a `…MB` pattern when `JEST_WORKERS=3`.
  - Limit is `undefined` when `JEST_WORKERS=1` (lets Jest choose in-band execution).
  - In `jest.config.mutation.js`, `maxWorkers` is forced to 1 and the limit is `undefined`, even with `JEST_WORKERS=3`.

## Relationships

- **`tests/support/environment.ts`** — imported as `@tests/environment`; provides `setProcessEnvironment`, which writes `JEST_WORKERS` into `process.env` for the duration of a test case. The harness restores the environment after each case, so no mutation leaks between tests.

## Notes

- The config under test is plain CommonJS with no TypeScript types, so `loadWith` uses `require` (hence the eslint-disable) and casts the result to `WorkerSettings`.
- `jest.isolateModules` is essential: without it, a second call with a different worker count would reuse the cached module and the env-var change would be invisible to the config's top-level code.
- The file intentionally does **not** snapshot the full config; it only asserts the two fields in `WorkerSettings`, keeping the tests resilient to unrelated config changes.
