---
source: jest.config.cluster.js
sha256: 5f026a7f3f584b43cc56f4faa2bc93f6efdf119d9484b6c90148292ae6ad000b
generated_at: 2026-09-23T17:15:06.543784+00:00
model: ollama:qwen3.8:27b
---

# jest.config.cluster.js

## Purpose

Dedicated Jest config for the cluster integration suite (`npm run test:cluster`). It exists as a separate file rather than a sub-directory of the main config because every default in `jest.config.js` is unsuitable here: the global setup, timeout, worker count, and coverage semantics all differ for tests that spawn child processes and measure rate-limiting under real TCP connections.

## Key elements

- **`module.exports`** — the single exported config object. Inherits `preset`, `moduleNameMapper`, `transform`, and `testEnvironment` from `./jest.config.js`.
- **`roots` / `testMatch`** — scopes execution strictly to `tests/cluster/**/*.test.ts`.
- **`maxWorkers: 1`** — forces serial execution. Each test boots a cluster on a real port and fires a traffic burst; running two in parallel makes rate-limit assertions non-deterministic.
- **`testTimeout: 240_000`** — 4-minute default (vs. 30 s in the base config) to accommodate cluster boot and Redis image pulls. Individual test files may override.

## Relationships

- **`jest.config.js`** — required at load time for `preset`, `moduleNameMapper`, `transform`, `testEnvironment`. The base config intentionally excludes `tests/cluster` from its own run so that `npm test` / `test:all` stay single-process and fast.

## Notes

- **No `setupFiles` override.** The base `tests/support/setup.ts` disables Redis rate-limiting and raises budgets — the exact behaviour this suite is measuring. It also cannot reach the child processes these tests spawn.
- **No `globalSetup`.** These tests boot their own in-memory `mongod` because their workers connect over TCP from a separate process and cannot share an in-process mongoose connection.
- **No `coverage` config.** The code under test executes in a child process; nothing in the Jest process is instrumented, so a coverage floor would only measure the harness.
- The config does not set `collectCoverage`, `setupFiles`, or `globalSetup` — their absence is deliberate, not an oversight.
