---
source: tests/unit/scripts/setup/first-run.test.ts
sha256: 8ad52143dcde311d84b3ad3ec94ba774d2396699813f827ef3daa3940e4b1da4
generated_at: 2026-10-15T13:32:05.306822+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scripts/setup/first-run.test.ts

## Purpose

Verifies that a fresh clone's `.env-example`—after `npm run setup` fills every `fillableKeys` placeholder—actually boots: `assertModuleConfig` must not throw under `NODE_ENV=development`. Guards against drift between the example file, the placeholder-filling logic, and the runtime config validators.

## Key elements

- **`everyRequiredKey()`** — Flattens all config slices (app + enabled modules) and collects every field that declares a `presence` rule, returning a string array of variable names.
- **`withoutEnvironmentInThisFile(everyRequiredKey())`** — Module-level call that clears those variables from `process.env` for the duration of this file, so the test exercises file content in isolation.
- **`describe('.env-example, filled by npm run setup')` / `it('boots clean under NODE_ENV=development')`** — Reads `../../../../.env-example`, runs `fillPlaceholders`, parses the result with `dotenv`, then calls `assertModuleConfig(enabledModules, APP_CONFIG_SLICES)` inside `withEnvironmentOverrides` and expects no throw.

## Relationships

- **`scripts/setup/environment-file.ts`** — Provides `fillPlaceholders`, the same function the production `npm run setup` script uses.
- **`scripts/setup/required-keys.ts`** — Provides `fillableKeys`, the list of placeholder keys to substitute.
- **`src/kernel/module-config.ts`** — Provides `assertModuleConfig`, the function whose non-throwing behavior is the assertion target.
- **`src/app/config.ts`** — Provides `APP_CONFIG_SLICES` and `allConfigSlices`, used both for the assertion and for building `everyRequiredKey`.
- **`src/modules.ts`** — Provides `enabledModules`, the module list passed to both `allConfigSlices` and `assertModuleConfig`.
- **`tests/support/environment.ts`** — Provides `withEnvironmentOverrides` (injects parsed dotenv values for the duration of the callback) and `withoutEnvironmentInThisFile` (strips listed keys so ambient env vars don't leak in).

## Notes

- The test file lives four directories below the project root; `.env-example` is read via `path.join(__dirname, '../../../../.env-example')`, so moving this file without updating that path will break it silently (read error at runtime).
- `NODE_METRICS_TOKEN` is intentionally allowed to be unset (`minLength: 0`); the doc comment calls this out so future contributors don't "fix" it by adding a required presence rule.
- The `everyRequiredKey` helper only targets fields with a *presence* rule; fields that are purely shape/type-validated (no presence) are left in the ambient environment and are not cleared.
