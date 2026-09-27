---
source: jest.config.cluster.js
sha256: 5928f6e5aa76057669569dece5eac9a87337252839ce93d7023a4a3ae67b8b3c
generated_at: 2026-09-27T13:48:24.652024+00:00
model: ollama:qwen3.8:27b
---

# jest.config.cluster.js

## Purpose

Dedicated Jest configuration for the `tests/cluster` suite (invoked via `npm run test:cluster`). It exists as a separate file rather than a directory under the main config because every default inherited from `jest.config.js` would be incorrect for process-level cluster tests: the setup files disable the very Redis/rate-limit machinery these tests measure, the global in-memory mongod is unreachable from spawned children over TCP, the default timeout is too short to boot a cluster and pull a Docker image, and coverage instrumentation is meaningless when the code under test runs in a separate process.

## Key elements

- **`base`** — `require('./jest.config.js')`; only `preset`, `moduleNameMapper`, `transform`, and `testEnvironment` are carried over. All other base settings are intentionally excluded.
- **`roots` / `testMatch`** — Restrict discovery to `<rootDir>/tests/cluster/**/*.test.ts`.
- **`maxWorkers: 1`** — Forces serial execution; parallel cluster boots on real ports would make rate-limit assertions non-deterministic.
- **`testTimeout: 240_000`** — 240 s global floor; individual test files may raise or lower it as needed.

## Relationships

- **`jest.config.js`** — Required as `base`; this file inherits four config keys from it. Conversely, `jest.config.js` excludes `tests/cluster` from its own `testMatch`/`roots`, so `npm test` (in-process suites) and `npm run test:cluster` (this config) are fully disjoint.

## Notes

- Do **not** add `setupFiles` or `globalSetup` back here — they were removed for specific reasons documented in the header comment. The setup file's `NODE_RATE_LIMIT_REDIS_ENABLED=0` and budget raises are the opposite of what cluster tests need, and the global mongod's mongoose connection cannot be shared across the process boundary.
- Coverage will not appear in this suite's output by design; any reported numbers would only reflect the test harness.
- Individual cluster test files are expected to set their own `jest.setTimeout` where 240 s is still insufficient.
