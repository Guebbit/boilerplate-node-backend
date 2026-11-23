---
source: src/app/development-doubles.ts
source_sha256: 8068f4f36e9a87d5aaca1b1d641c9a6936504460d521683fc02fb82b2ed01f52
context_sha256: 76719a21d9257329c3190730737a4f92bac98e83ae49d8ee887f2bb4e5112847
generated_at: 2026-11-22T02:30:04.350307+00:00
model: claude-code:claude-sonnet-5-5
---

# src/app/development-doubles.ts

## Purpose
Single runtime entry point from `src/` into `scenarios/`. When a process boots with `NODE_ENV=development`, it loads the development doubles from `scenarios/support/development-doubles.ts` at boot, instead of via a per-script `--import`. It uses a runtime `import()` because the production image has no `scenarios/`, and a static import would break both the build and the `src-cannot-reach-scenarios` rule.

## Key elements
- `DEVELOPMENT_DOUBLES_PATH` — the string `'scenarios/support/development-doubles.ts'`, relative to the working directory (the same rule `dotenv` uses for `.env`). It is a literal because depcruise, knip and tsc cannot follow the computed path in the loader. A unit test checks that it still names a file.
- `loadDevelopmentDoubles()` — returns `Promise<void>`.
  - If `nodeEnvironment()` is not `'development'`, it resolves immediately and registers nothing.
  - In development, it joins `process.cwd()` with the path and checks the file with `access`. If the file is missing, it throws an `Error` saying the image has no `scenarios/` and that production should run with `NODE_ENV=production`. Otherwise it dynamically `import()`s the file and resolves with `undefined`.

## Relationships
- `src/main.ts` and `scripts/run-script.ts` — the only callers, per the module doc. They call `loadDevelopmentDoubles()` at boot.
- `src/worker.ts` — listed as a graph neighbor, but the file itself names only `main.ts` and `run-script.ts` as callers.
- `src/infrastructure/runtime/config.ts` — supplies `nodeEnvironment()`, which gates the load.
- `tests/unit/app/development-doubles.test.ts` — unit tests for this module, including the check that `DEVELOPMENT_DOUBLES_PATH` names a real file.
- `tests/unit/scripts/run-script.test.ts` — tests for the script runner that calls this loader.

## Notes
- Under jest, nothing is loaded here. Jest registers its own doubles via `tests/support/setup.ts`.
- The dynamic import of a computed `.ts` path works because both tsx and ts-jest resolve a bare `.ts` path.
- A development `NODE_ENV` in the production image fails at boot with the explicit error above, rather than an obscure module-not-found error.
