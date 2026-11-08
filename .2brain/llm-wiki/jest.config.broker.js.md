---
source: jest.config.broker.js
sha256: 1c001b651e19b904da5709fc9968f00f8739db22e41bdf4fe6678d892be184e7
generated_at: 2026-11-08T02:25:11.684535+00:00
model: ollama:qwen3.8:27b
---

# jest.config.broker.js

## Purpose

Jest configuration for the broker (RabbitMQ) test suite, invoked via `npm run test:broker`. It strips away base-config setup that the queue adapter doesn't need (i18n boot, rate-limit budgets, in-memory MongoDB) and relaxes timeouts to accommodate container pulls and real retry TTLs.

## Key elements

- **Extends `./jest.config.js`** — requires the base config and inherits `preset`, `moduleNameMapper`, `transform`, `cacheDirectory`, and `testEnvironment`.
- **`roots` / `testMatch`** — scoped to `<rootDir>/tests/broker` and `**/tests/broker/**/*.test.ts` so only broker tests are collected.
- **`maxWorkers: 1`** — forces serial execution because test files share a single broker and wait on real TTLs; parallel workers would make timings flaky.
- **`testTimeout: 120_000`** — 120 s default; individual test files may override this further.
- **Deliberately omitted** (not inherited from base): `setupFiles` and `globalSetup`, because broker tests build their adapter environment per-case and read no database.

## Relationships

- **`jest.config.js`** — the base config this file requires. It supplies the TypeScript preset, module mapping, transform, cache path, and environment. In the reverse direction, `jest.config.js` scopes its own `roots` to exclude `tests/broker`, so the default `npm test` never picks up broker tests or starts a container.

## Notes

- The two configs share the same on-disk Jest cache directory (inherited from base), avoiding redundant `node_modules` recompilation.
- `maxWorkers: 1` is intentional, not a performance oversight: the broker is a single shared resource and tests depend on wall-clock TTLs.
- If you add a new broker test file, it only needs to match the `tests/broker/**/*.test.ts` pattern — no extra registration required.
