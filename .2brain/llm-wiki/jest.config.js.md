---
source: jest.config.js
source_sha256: 4a0da037fba1d1c974c8b33def92c83a871f683d87fcf5cf572611587cfaaf9a
context_sha256: 094144f250f64a30e4e16312511217202dacb7bb8ec178f073842a9644c433a6
generated_at: 2026-11-22T01:35:53.859709+00:00
model: claude-code:claude-sonnet-5-5
---

# jest.config.js

## Purpose
Jest configuration for the unit test run, and the base that the other Jest configs extend. It is a `.js` file rather than JSON so settings can carry explanatory comments. Coverage is not measured; the mutation score is the test-quality number (documented in the project's build docs on coverage and confidence).

## Key elements
- **`process.env.DOTENV_PATH`**: set at top level to a path that cannot exist (a non-existent file under `tests/support/`). This makes `dotenv/config` (imported by `src/app.ts`) a no-op, so tests never load a developer's `.env`. An empty string would not work, because dotenv treats it as unset.
- **`readEnvFile` / `envFileValues`**: reads `.env` once with `util.parseEnv`, without merging it into `process.env`. It returns `{}` when no file exists, which is the normal case in CI.
- **`DEPTH_KNOBS`**: an allowlist (`TEST_FUZZ_RUNS`, `TEST_PROPERTY_RUNS`, `TEST_PROPERTY_RUNS_DB`, `TEST_RACE_SIZE`). Values from `.env` are promoted into `process.env` with `??=`, so a real environment variable wins.
- **`DEFAULT_MAX_WORKERS` (2) and `DEFAULT_WORKER_MEMORY_MB` (1400)**: fallbacks for a bare `npx jest`.
- **`fromEnvironment(name, fallback)`**: resolves a positive integer from the real environment first, then `.env`. Unset, empty or invalid values fall back to the default.
- **`maxWorkers`**: read from `JEST_WORKERS`.
- **Exported config**:
  - Uses the `ts-jest` preset, with the transform cache on disk under `node_modules`.
  - Uses a custom `testEnvironment` (`tests/support/test-environment.ts`) that clears timers a file leaves running.
  - Sets `workerIdleMemoryLimit` from `JEST_WORKER_MEMORY_MB`, but only when `maxWorkers > 1`.
  - Matches `**/tests/**/*.test.ts`, excluding `tmp/`, `.claude/worktrees/`, `tests/replicas/` and `tests/broker/`.
  - Runs `globalSetup`, `globalTeardown` and `setupFiles` from `tests/support/`.
  - `setupFilesAfterEnv` runs, in order, the file sandbox, the environment reset, and a fail-on-undeclared-warning hook.
  - Sets `testTimeout` to 30s.
  - Transforms `.ts`/`.tsx` with `ts-jest` using `tsconfig.jest.json`, and ignores diagnostic code 151002.
  - Transforms `.js`/`.jsx` with `babel-jest` and `@babel/plugin-transform-modules-commonjs`.
  - `transformIgnorePatterns` carves ESM-only packages out of the `node_modules` ignore: `@scure`, `@noble`, `@mdit-vue`, `jose`, `oauth4webapi`, `openid-client` and `sitemap`.
  - `moduleNameMapper` covers the path aliases (`@api`, `@types`, `@tests`, `@app`, `@infrastructure`, `@kernel`, `@modules`, `@domain-primitives`, `@scenarios`). It also stubs `puppeteer-core` and one `sitemap` file that reads `import.meta`.

## Relationships
- **`jest.config.mutation.js`**: extends this config. It must drop `workerIdleMemoryLimit` when it narrows `maxWorkers`.
- **`jest.config.replicas.js`**: extends this config but runs no `setupFiles` or `globalSetup`. This is why `DOTENV_PATH` and the depth knobs are set at module top level.
- **`jest.config.broker.js`**: `tests/broker/` is excluded here and runs under that config, since it needs a real RabbitMQ and no database.
- `tests/replicas/` is likewise excluded here and handled by `jest.config.replicas.js`.

## Notes
- Command-line flags from `scripts/testing/run-suite.ts` (`--maxWorkers`, `--workerIdleMemoryLimit`, `--max-old-space-size`) override the worker values here. The values in this file only apply to ad-hoc runs. The file is CommonJS and cannot import that ESM sizing module.
- `workerIdleMemoryLimit` must stay `undefined` for single-worker runs. Setting it disables Jest's implicit in-band path, and a past run reported nothing for 87 minutes.
- Setting the memory limit below a worker's steady-state baseline makes Jest restart workers after every test file.
- The `moduleNameMapper` entry for the `sitemap` xmllint file matches the specifier regardless of which package imports it.
- `.env` is deliberately never merged into `process.env`. Doing so would apply real rate limits before `tests/support/setup.ts` can raise them, and concurrency suites would get 429 responses.
