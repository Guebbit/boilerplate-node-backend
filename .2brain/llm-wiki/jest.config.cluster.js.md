---
source: jest.config.cluster.js
sha256: f5c8311cd2d10d0277e37fe3bf3e7084788870eb56bd8e504e21eed534b2e5c5
generated_at: 2026-10-14T06:53:06.448493+00:00
model: ollama:qwen3.8:27b
---

# jest.config.cluster.js

## Purpose
Dedicated Jest configuration for the cluster integration suite (`npm run test:cluster`). It exists as a separate file (not another directory under the main config) because the defaults in `jest.config.js` are each specifically wrong for cluster tests — setup would interfere, shared infrastructure would be unreachable from spawned child processes, and the default timeout is too short for real cluster boot + Redis image pulls.

## Key elements
- **`base`** — `require('./jest.config.js')`; source of inherited settings.
- **Inherited from `base`** — `preset`, `moduleNameMapper`, `transform`, `testEnvironment` (the four settings that remain correct for cluster tests).
- **`roots` / `testMatch`** — scope execution to `tests/cluster/**/*.test.ts` only.
- **`maxWorkers: 1`** — forces serial execution; each case boots a real worker cluster on a real port, and parallel cases would contend for CPU and invalidate rate-limit assertions.
- **`testTimeout: 240_000`** — 240 s ceiling (individual test files may set their own); covers cluster boot and Redis image pull.

## Relationships
- **`jest.config.js`** — required at the top; this file copies four properties from it. In turn, `jest.config.js` excludes `tests/cluster` from its own `roots`/`testMatch` so `npm test` stays single-process and fast.

## Notes
- `setupFiles`, `globalSetup`, and `testTimeout` from the base config are **intentionally not inherited**. The header comment documents exactly why each is wrong (setup blanks the env var under test; the shared in-memory mongod is unreachable from spawned children; 30 s is too short).
- Cluster tests are self-contained: they boot their own MongoDB, hand a full environment to child processes they spawn, and manage their own Redis. Do not add shared setup here.
