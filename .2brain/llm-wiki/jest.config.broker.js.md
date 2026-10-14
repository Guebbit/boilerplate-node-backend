---
source: jest.config.broker.js
sha256: 7cde6f396f2e90806855bf6807e61ed8de1733a21064595a68dff543aee03eb3
generated_at: 2026-10-14T06:52:51.824380+00:00
model: ollama:qwen3.8:27b
---

# jest.config.broker.js

## Purpose

Jest configuration for the broker (RabbitMQ) test suite, invoked via `npm run test:broker`. It exists because the base `jest.config.js` defaults—rate-limit setup, mongod bootstrap, 30 s timeout—are irrelevant or insufficient for queue-adapter tests that manage their own environment and depend on real TTLs.

## Key elements

- **`roots` / `testMatch`** — scopes execution to `tests/broker/**/*.test.ts` only.
- **`maxWorkers: 1`** — forces serial file execution; concurrent files would race on the shared broker and make TTL-based timing flaky.
- **`testTimeout: 120_000`** — 120 s ceiling, accommodating RabbitMQ container pulls and retry-TTL waits (individual files may set their own).
- **`preset`, `moduleNameMapper`, `transform`, `testEnvironment`** — inherited from the base config via `require('./jest.config.js')`.
- **Deliberately omitted from base**: `setupFiles`, `globalSetup`, and the base `testTimeout` are *not* carried over (the broker suite boots no i18n, no database, and needs a longer timeout).

## Relationships

- **`jest.config.js`** — parent config; this file destructures its `preset`, `moduleNameMapper`, `transform`, and `testEnvironment` as starting points, then overrides the rest. The base config excludes `tests/broker` from its own `roots`, so `npm test` never triggers a container pull.

## Notes

- The base config's `setupFiles` (`tests/support/setup.ts`) and `globalSetup` (in-memory mongod) are intentionally *excluded* here, not accidentally left out.
- Individual test files inside `tests/broker` may set their own `jest.setTimeout`; the 120 s value is a hard ceiling, not a target.
- `maxWorkers: 1` is a correctness guard, not a performance tuning knob—do not raise it without re-evaluating TTL contention.
