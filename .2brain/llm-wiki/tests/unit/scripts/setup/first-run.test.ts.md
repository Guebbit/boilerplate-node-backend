---
source: tests/unit/scripts/setup/first-run.test.ts
sha256: 8ad52143dcde311d84b3ad3ec94ba774d2396699813f827ef3daa3940e4b1da4
generated_at: 2026-11-08T10:43:05.049301+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scripts/setup/first-run.test.ts

## Purpose

Guarantees that a fresh clone's `.env-example`, after `npm run setup` fills every placeholder `fillableKeys` knows about, actually boots: `assertModuleConfig` must not throw. Also pins the contract that a `minLength: 0` field (e.g. `NODE_METRICS_TOKEN`) may remain unset without being treated as missing.

## Key elements

- **`everyRequiredKey()`** – Collects the names of every config variable that carries a `presence` rule across `enabledModules` plus the app-tier slices, via `allConfigSlices`.
- **`withoutEnvironmentInThisFile(everyRequiredKey())`** – Strips all of those variables from the ambient process environment so the test starts from a clean slate.
- **`describe('.env-example, filled by npm run setup')` / `it('boots clean under NODE_ENV=development')`** – The single test case: reads `../../.env-example`, runs `fillPlaceholders` with `fillableKeys`, parses the result with `dotenv`, then calls `assertModuleConfig(enabledModules, APP_CONFIG_SLICES)` inside `withEnvironmentOverrides` and asserts no throw.

## Relationships

- **`scripts/setup/environment-file.ts`** – Supplies `fillPlaceholders`, the same function the real `npm run setup` script calls; this test exercises it against the checked-in `.env-example`.
- **`scripts/setup/required-keys.ts`** – Supplies `fillableKeys`, the list of keys the setup script is expected to fill.
- **`src/kernel/module-config.ts`** – Supplies `assertModuleConfig`, the validation under test.
- **`src/app/config.ts`** – Supplies `APP_CONFIG_SLICES` (passed to `assertModuleConfig`) and `allConfigSlices` (used by `everyRequiredKey`).
- **`src/modules.ts`** – Supplies `enabledModules`, the set of modules whose config is validated.
- **`tests/support/environment.ts`** – Supplies `withEnvironmentOverrides` (injects the parsed dotenv values) and `withoutEnvironmentInThisFile` (prevents ambient leakage).

## Notes

- The test intentionally removes *every* presence-ruled variable from `process.env` before running, so a developer who has those set locally won't accidentally satisfy the assertion.
- Only `NODE_ENV=development` is exercised; a production-mode boot is not covered here.
- The test reads `.env-example` relative to the repo root (`path.join(__dirname, '../../../../.env-example')`), so it depends on the file existing at that path.
