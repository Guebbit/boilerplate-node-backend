---
source: jest.config.broker.js
source_sha256: cd2ce12546abd0c127460bff76ef7f366a8707089917164798d231f3d708e371
context_sha256: 8ea95f727d77948c02c8d90cb96666bb2427991c9f00ea2f2fd7d93634df776d
generated_at: 2026-11-22T01:35:34.128236+00:00
model: claude-code:claude-sonnet-5-5
---

# jest.config.broker.js

## Purpose
Jest configuration for the broker test suite, run with `npm run test:broker`. It derives from `jest.config.js` but overrides the settings that don't suit tests which need a real message broker (RabbitMQ) and a shared in-memory MongoDB. It follows the same approach as `jest.config.replicas.js`.

## Key elements
- **Inherited from base:** `preset`, `moduleNameMapper`, `transform`, `transformIgnorePatterns` (so ESM-only packages such as `jose`, loaded by the app boot, are transformed), `cacheDirectory`, `testEnvironment`, `globalSetup` and `globalTeardown`.
- **`setupFiles`:** only `tests/support/setup-environment.ts`. It sets plain `??=` env defaults with no imports, including `NODE_PSEUDONYM_KEY`, which has no built-in value. It deliberately avoids `tests/support/setup.ts`, which boots i18n and raises budgets the queue adapter doesn't need.
- **`globalSetup` / `globalTeardown`:** start and stop a shared in-memory mongod. The app/worker boot case and the spawned workers in `tests/broker/worker-shutdown.test.ts` connect to it through `NODE_TEST_MONGO_URI`.
- **`roots` / `testMatch`:** limited to `tests/broker` and `**/tests/broker/**/*.test.ts`.
- **`maxWorkers: 1`:** files run one at a time because they share one broker and wait on real TTLs.
- **`testTimeout: 120_000`:** 120 seconds.

## Relationships
- Imports `jest.config.js` through `require` and reuses most of its fields instead of redefining them.
- `jest.config.js` ignores `tests/broker`, so `npm test` needs no container. This config is the only runner for that directory.

## Notes
- The header comment says `testTimeout` is 30s, but the code sets `120_000` (120s). The code is authoritative, and the comment appears stale.
- The header says individual test files set their own timeouts where they need longer ones.
