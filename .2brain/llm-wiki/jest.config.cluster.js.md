---
source: jest.config.cluster.js
sha256: 373da9cda33e2498089aa537a3259f514015247ef90930aa37ef1274fba1f337
generated_at: 2026-11-08T02:25:18.768086+00:00
model: ollama:qwen3.8:27b
---

# jest.config.cluster.js

## Purpose

Jest configuration for the cluster integration suite (invoked via `npm run test:cluster`). It exists separately from `jest.config.js` because nearly every default in the base config is wrong for tests that spawn real worker processes over TCP and boot their own MongoDB/Redis instances.

## Key elements

- **`module.exports`** — The only export. Spreads selected base-config keys and overrides the rest:
  - **`preset`, `moduleNameMapper`, `transform`, `cacheDirectory`, `testEnvironment`** — Inherited from `./jest.config.js` via `require`.
  - **`roots` / `testMatch`** — Scoped to `<rootDir>/tests/cluster/**/*.test.ts`.
  - **`maxWorkers: 1`** — Forces serial execution so concurrent worker bursts don't contend for CPUs and invalidate rate-limit assertions.
  - **`testTimeout: 240_000`** — 4 minutes, accommodating cluster boot + Redis image pull. Individual test files may override further.
- **`base`** — Local reference to the required `./jest.config.js` object; used to inherit the five shared keys above.

## Relationships

- **`jest.config.js`** — Required at the top; this file copies `preset`, `moduleNameMapper`, `transform`, `cacheDirectory`, and `testEnvironment` from it. The base config, in turn, excludes `tests/cluster` from its own `roots`/`testMatch` so `npm test` never picks these up.

## Notes

- `setupFiles` and `globalSetup` from the base config are intentionally **not** inherited. The base `setupFiles` blanks `NODE_RATE_LIMIT_REDIS_URL` and raises budgets (the very values under test here) and would not reach the spawned child process anyway. The base `globalSetup` starts an in-memory mongod; cluster tests boot their own because workers connect over TCP from another process.
- The shared `cacheDirectory` with the base config is deliberate (see the comment in `jest.config.js` for the reasoning).
- Individual test files in `tests/cluster` set their own timeouts when 240 s is not enough.
