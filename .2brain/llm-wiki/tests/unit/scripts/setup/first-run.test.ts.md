---
source: tests/unit/scripts/setup/first-run.test.ts
sha256: 094631b3b111a61584a7a16c5f4cdae19a8c7683dc511e34e5e681ee7050285b
generated_at: 2026-09-27T16:14:34.452414+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scripts/setup/first-run.test.ts

## Purpose

Regression test guaranteeing that a fresh clone's `.env-example`, after placeholder-filling (simulating `npm run setup`), boots without `assertRequiredConfig` throwing. Written to catch the B11a `fails()` bug where `NODE_METRICS_TOKEN` (`minLength: 0`) was unreachable, causing validation to fail even on a fully filled file.

## Key elements

- **`everyRequiredKey()`** — Collects every `key` from `enabledModules[*].requiredConfig` and `APP_NON_MODULE_CHECKS.required`, returning a flat string array. Used solely for env isolation.
- **`withoutEnvironmentInThisFile(everyRequiredKey())`** — Called at module scope; ensures no real environment variables for any required key leak into the test process.
- **`afterEach(() => enableDemoProfile(false))`** — Resets the demo profile flag after every test.
- **`it('boots clean under NODE_ENV=development')`** — Reads `../../../../.env-example`, runs `fillPlaceholders` with `fillableKeys()`, parses the result via `dotenv`, then calls `assertRequiredConfig(enabledModules, APP_NON_MODULE_CHECKS)` inside `withEnvironmentOverrides` and asserts it does not throw.

## Relationships

- **`scripts/setup/environment-file.ts`** → supplies `fillPlaceholders`, the same function `npm run setup` uses to produce a filled `.env`.
- **`scripts/setup/required-keys.ts`** → supplies `fillableKeys`, the list of placeholder keys that `fillPlaceholders` knows how to replace.
- **`src/kernel/required-config.ts`** → supplies `assertRequiredConfig`, the validation function under test.
- **`src/modules.ts`** → supplies `enabledModules`, the module list whose config schemas are validated.
- **`src/app/required-config.ts`** → supplies `APP_NON_MODULE_CHECKS`, the app-level (non-module) config checks.
- **`src/infrastructure/runtime/demo-profile.ts`** → supplies `enableDemoProfile(false)` for post-test cleanup.
- **`tests/support/environment.ts`** → supplies `withEnvironmentOverrides` (in-test env injection) and `withoutEnvironmentInThisFile` (pre-test env stripping).

## Notes

- The test intentionally reads the **raw** `.env-example` file and fills it in-memory; it does not invoke the actual `npm run setup` script. Keep `fillableKeys` and `fillPlaceholders` in sync with what the real setup writes.
- `NODE_ENV` is forced to `'development'` inside the override scope; the test does not cover production-mode validation.
- The `Promise.resolve()` return inside the async test body is a no-op (satisfies the async signature without awaiting anything).
