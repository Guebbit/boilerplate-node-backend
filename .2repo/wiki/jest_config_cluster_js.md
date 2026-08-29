# jest.config.cluster.js

## Purpose

Dedicated Jest configuration for the cluster integration test suite (`npm run test:cluster`). It exists as a standalone file rather than a sub-directory of the main config because nearly every default in `jest.config.js` is unsuitable for tests that spawn a real multi-process cluster: the in-process setup, shared mongod, timeout, and coverage assumptions all break down when the code under test runs in a child process.

## Key elements

- **`base`** — `require('./jest.config.js')`; re-uses only `preset`, `moduleNameMapper`, `transform`, and `testEnvironment` from the main config.
- **`roots` / `testMatch`** — restricts discovery to `<rootDir>/tests/cluster/**/*.test.ts`.
- **`maxWorkers: 1`** — forces sequential execution; parallel cases would contend for CPU and make rate-limit assertions non-deterministic.
- **`testTimeout: 240_000`** — 4-minute ceiling (individual tests may lower it); accounts for cluster boot + Redis image pull.
- **Deliberate omissions** — no `setupFiles`, no `globalSetup`, no `coverage` key. Each is intentionally absent for the reasons documented in the header comment.

## Relationships

- **`jest.config.js`** — Required at top of this file; only four properties are copied. The main config, in turn, excludes `tests/cluster` from its own discovery so that `npm test` / `test:all` stay single-process and fast. The two configs are mirrors: one opts the cluster dir in, the other opts it out.

## Notes

- The cluster suite spawns its own mongod and Redis inside the child process; the parent Jest process holds no mongoose connection to hand over. Any `globalSetup` or `setupFiles` from the base config would be inert here.
- Coverage is disabled by omission (not `collectCoverage: false`). The child process is uninstrumented, so any coverage number would reflect only the test harness.
- Each test file is expected to set its own `jest.setTimeout` if it needs less than the 240 s global ceiling.
