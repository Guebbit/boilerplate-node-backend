---
source: jest.config.broker.js
sha256: 55809430827a96b1e28c196c5243150ed5e8bf3a6effcc69b5bbb2dcfedf2d94
generated_at: 2026-10-07T23:49:15.073869+00:00
model: ollama:qwen3.8:27b
---

# jest.config.broker.js

## Purpose

Jest runner configuration for the broker (queue-adapter) integration suite, invoked via `npm run test:broker`. It overrides the shared defaults in `jest.config.js` that are inapplicable here—no shared setup files, no in-memory database, and a longer timeout to accommodate pulling a RabbitMQ image and waiting out real retry TTLs.

## Key elements

- **`module.exports`** – The Jest config object. Inherits `preset`, `moduleNameMapper`, `transform`, and `testEnvironment` from the base config; everything else is overridden or intentionally omitted.
- **`roots` / `testMatch`** – Scope test discovery to `<rootDir>/tests/broker/**/*.test.ts` only.
- **`maxWorkers: 1`** – Forces serial execution. The test cases share a single broker instance and wait on real TTLs; parallel files would race and make timing assertions flaky.
- **`testTimeout: 120_000`** – 120 s default. Individual test files may set longer timeouts for especially slow retry-TTL scenarios.
- **Omitted keys** – `setupFiles`, `globalSetup`, and `coverage` are deliberately *not* inherited; the broker suite builds its own environment per case, uses no database, and coverage is already handled by the unit suite for `queue.ts`.

## Relationships

- **`jest.config.js`** – Required as `base`; this file pulls `preset`, `moduleNameMapper`, `transform`, and `testEnvironment` from it. Conversely, `jest.config.js` excludes `tests/broker` from its `roots` so the default `npm test` run never spins up a container.

## Notes

- The 120 s `testTimeout` is a *floor*, not a ceiling—individual test files are expected to raise it further when a scenario requires waiting out longer retry windows.
- Because `maxWorkers` is 1, the whole suite is as slow as the sum of its cases. This is intentional and should not be "fixed" by increasing parallelism.
- Do not add `globalSetup` or `setupFiles` here without first confirming the broker tests do not already handle that concern in-test; the existing design is per-case environment construction.
