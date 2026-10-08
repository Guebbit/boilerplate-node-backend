---
source: jest.config.cluster.js
sha256: 26976afd6e65de4dc2e1a1d4c6f29db4a0f0ed660f62c4e940f058cf3e406a19
generated_at: 2026-10-07T23:49:25.860166+00:00
model: ollama:qwen3.8:27b
---

# jest.config.cluster.js

## Purpose

Dedicated Jest configuration for the cluster test suite (run via `npm run test:cluster`). It exists as a separate file—rather than a sub-directory of the main config—because the defaults in `jest.config.js` (setup files, global setup, timeout, coverage) are each incorrect for tests that spawn real child-process workers and measure their rate-limiting behavior over TCP.

## Key elements

- **`require('./jest.config.js')`** – Loads the base config and selectively inherits `preset`, `moduleNameMapper`, `transform`, and `testEnvironment`. Everything else in the base is deliberately *not* carried over.
- **`roots` / `testMatch`** – Scopes the suite to `tests/cluster/**/*.test.ts` only.
- **`maxWorkers: 1`** – Forces serial execution so that concurrent cluster bursts don't distort CPU contention and make rate-limit assertions non-deterministic.
- **`testTimeout: 240_000`** – 4-minute default (vs. the 30 s in the main config) to accommodate cluster boot and Redis image pulls; individual files may override further.
- **Absent keys** – `setupFiles`, `globalSetup`, `coverage`, and the base `testTimeout` are intentionally omitted. Each is explained in the header comment as harmful or meaningless for out-of-process tests.

## Relationships

- **`jest.config.js`** – This file `require`s it at the top and copies four fields (`preset`, `moduleNameMapper`, `transform`, `testEnvironment`) into its own export. All other base settings are deliberately left out. Conversely, `jest.config.js` excludes `tests/cluster` from its own `testMatch`/`roots`, so the two configs partition the test tree with no overlap.

## Notes

- Do **not** add `setupFiles` or `globalSetup` here: the in-process setup (`tests/support/setup.ts`) blanks `NODE_RATE_LIMIT_REDIS_URL` and raises budgets, which would defeat the very behavior under test, and it wouldn't reach the spawned child processes anyway.
- Coverage reporting is intentionally disabled; the code under test runs in a child process, so nothing in the Jest worker is instrumented.
- The 4-minute timeout is a *floor*—individual test files set their own longer timeouts when needed (e.g., Docker image pulls).
- Running two cluster tests in parallel (i.e., changing `maxWorkers`) will cause rate-limit assertions to fail non-deterministically due to CPU contention; keep it at `1`.
