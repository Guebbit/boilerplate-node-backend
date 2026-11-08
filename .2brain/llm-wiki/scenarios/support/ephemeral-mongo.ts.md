---
source: scenarios/support/ephemeral-mongo.ts
sha256: bada78210bb065708b122f00f4be6a8a0bf6d30b25d6c640a52c54c602ab18bf
generated_at: 2026-11-08T02:34:58.834457+00:00
model: ollama:qwen3.8:27b
---

# scenarios/support/ephemeral-mongo.ts

## Purpose

Resolves which Mongo instance a test suite or demo profile should connect to. It is a pure branching/decision module: check the `NODE_TEST_MONGO_URI` env var for an already-running database, and if absent, delegate to a caller-supplied `startInProcess` function. It deliberately does not import or start `mongodb-memory-server` itself.

## Key elements

- **`EphemeralMongo` (interface)** — the return shape: `{ uri: string; stop: () => Promise<void> }`.
- **`startEphemeralMongo(options)` (exported function)** — the sole public entry point. Reads `NODE_TEST_MONGO_URI`; if set, resolves immediately with a no-op `stop`. Otherwise calls `usePreinstalledBinary()` then delegates to `options.startInProcess(options.dbPath)`.
- **`usePreinstalledBinary()` (private function)** — if `MONGOMS_SYSTEM_BINARY` names an existing file, sets `MONGOMS_SYSTEM_BINARY_VERSION_CHECK` and `MONGOMS_MD5_CHECK` to skip the ~100 MB first-run download. No-op when the var is unset or the path is missing.

## Relationships

- **`scenarios/support/ephemeral-mongod.ts`** — provides the real `startInProcessMongod` implementation. This module never statically imports it; callers pass it in as the `startInProcess` argument.
- **`scenarios/run-server.ts`** — a real caller that supplies `startInProcessMongod`.
- **`tests/support/global-setup.ts`** — a real caller; loads this module via relative path (jest's `moduleNameMapper` does not apply in global setup).
- **`tests/cluster/support/cluster.ts`** — a real caller that supplies `startInProcessMongod`.
- **`tests/unit/scenarios/ephemeral-mongo.test.ts`** — unit-tests `startEphemeralMongo` with a fake `startInProcess`, keeping the import graph free of `mongodb-memory-server`.
- **`src/infrastructure/adapters/logger.ts`** — imported via relative path for log output on each branch.

## Notes

- `startInProcess` is **required** in the options type (no default). This is deliberate: a default value would create a static import edge to `./ephemeral-mongod.ts`, violating the `unit-layer-stays-database-free` dependency-cruiser rule because reachability-based analysis would trace the unit test's import graph into `mongodb-memory-server`.
- The logger import is relative (`../../src/…`) rather than using the `@infrastructure` alias because `tests/support/global-setup.ts` is loaded by jest outside the normal `moduleNameMapper` context — the alias would resolve under `tsc`/`eslint` but fail at runtime.
- `usePreinstalledBinary()` must run in the same process and before the `startInProcess` call; it is pure env-var bookkeeping and safe to keep in `src/`-adjacent code.
- There is intentionally no "container-per-run" branch for Mongo (unlike Redis). The two existing paths already cover all cases, and a third branch would make a container engine mandatory to run tests.
