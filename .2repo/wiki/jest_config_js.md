# jest.config.js

## Purpose

Jest configuration for the unit / cross-cutting test suite. Written as `.js` rather than `.json` so the coverage thresholds can carry inline explanations that JSON cannot hold. It defines the test glob, worker count, coverage collection, and per-file coverage floors that run in CI, while explicitly excluding the cluster and mutation suites (handled by their own configs).

## Key elements

- **`readEnvFile()`** — Parses `.env` with `node:util`'s `parseEnv` to extract `JEST_WORKERS` without merging the whole file into `process.env` (avoids leaking rate-limit vars into workers).
- **`resolveMaxWorkers()`** — Returns the worker count: `JEST_WORKERS` from env/file if set, otherwise `os.cpus().length - 2`, clamped to ≥ 1. Exists because Jest's default (logical CPUs − 1) OOM-kills workers on 32-core machines.
- **`testMatch` / `testPathIgnorePatterns`** — Matches `**/tests/**/*.test.ts`; excludes `tests/cluster/` (delegated to `jest.config.cluster.js`) and Stryker/tmp directories.
- **`collectCoverageFrom`** — Collects from `src/**/*.ts` while excluding type declarations and co-located `src/**/tests/**` (prevents a module's own specs from inflating its own floor).
- **Per-file `coverageThreshold` globs** — Floors on `model.ts`, `repository.ts`, `service.ts` under `src/modules/<name>/`. Uses glob (file-level) keys rather than directory keys so each file is measured individually. Deliberately does **not** floor controllers (covered by contract/integration suites elsewhere) or newer per-module files (`audit.ts`, `metrics.ts`, etc.) whose floors await architecture stabilisation.
- **`clearMocks: true`, `coverageProvider: 'v8'`, `testEnvironment: 'node'`** — Standard runtime flags.

## Relationships

- **`jest.config.cluster.js`** — This config explicitly excludes `tests/cluster/` via `testPathIgnorePatterns`. Those tests spawn `src/cluster.ts` as a child process, boot their own Mongo, and require Redis; they are run under the cluster config instead, where setup and timeouts differ.
- **`jest.config.mutation.js`** — The mutation suite (Stryker) is the project's primary test-quality instrument; the coverage floors here are a cheaper CI proxy. The mutation config's `mutate` list is intentionally wider than this file's floored set. A path added to the mutation config is a candidate for a floor here once measured.

## Notes

- **Glob vs. directory threshold keys:** A directory key pools all files under it into one total; a glob key measures each file separately and names each failure. This config uses globs on purpose.
- **Silent ignore trap:** A threshold key that matches no file is silently dropped (no error, green run). Renaming a source directory without updating these keys silently disables the floor.
- **Exemption mechanism:** To exempt a file from a glob floor, negate it out of the glob *and* give it its own key. Adding a second lower key alongside the glob does not work—Jest applies the file to every matching group and the stricter one still fails.
- **Floor values are a ratchet, not a target:** Several floors (e.g. `service.ts` at 37 % statements) are low because 36 module specs were moved to `tests/integration` and are no longer visible to this run. They reflect what the unit layer alone reaches, not a quality target.
- **`JEST_WORKERS` env var** overrides the `.env` file value, allowing `JEST_WORKERS=2 npm run test:unit` for ad-hoc runs without editing config.
