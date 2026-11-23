---
source: jest.config.replicas.js
source_sha256: 9dac477b6c11f20682999ccde28d02ea471ea165237b55a61c35a20a5376d5b9
context_sha256: 8ea95f727d77948c02c8d90cb96666bb2427991c9f00ea2f2fd7d93634df776d
generated_at: 2026-11-22T01:36:16.392594+00:00
model: claude-code:claude-sonnet-5-5
---

# jest.config.replicas.js

## Purpose
Jest configuration for the replicas test suite, run via `npm run test:replicas`. It is separate from `jest.config.js` because the base config's defaults (setup files, global setup, timeout) are wrong for tests that spawn several real copies of the app on real ports and measure behavior under load.

## Key elements
- **Module export**: a Jest config object that reuses part of the base config and overrides the rest.
- **Inherited from `jest.config.js`**: `preset`, `moduleNameMapper`, `transform`, `cacheDirectory` (the same on-disk cache), and `testEnvironment`.
- **`roots` / `testMatch`**: restricted to `tests/replicas`, matching `**/tests/replicas/**/*.test.ts`.
- **`maxWorkers: 1`**: runs one test file at a time, so concurrent bursts don't compete for CPU and distort rate-limit assertions.
- **`testTimeout: 240_000`**: 240 seconds, far above the base 30s, because booting several copies and pulling a Redis image takes longer. Individual files set their own timeouts.

## Relationships
- Imports `jest.config.js` via `require` and copies selected fields from it.
- Deliberately omits the base config's `setupFiles` and `globalSetup`.
- `jest.config.js` ignores `tests/replicas`, so `npm test` stays in one process and fast, and the two configs never overlap.

## Notes
- Setup is omitted for stated reasons:
  - The base `setupFiles` script raises the budgets, which is the thing this suite measures. It also wouldn't reach the spawned child processes, which receive a whole environment instead.
  - The base `globalSetup` starts a shared in-memory mongod, which can't be used because workers connect over TCP from another process and can't be handed the parent's mongoose connection. These tests boot their own.
- A new base-config field that should apply here must be copied explicitly, since only the listed fields are inherited.
