---
source: scripts/setup/required-keys.ts
sha256: 59088c78e3da9fb7a690e63258e88167d2b6341b991ae5b47d363fa33e158623
generated_at: 2026-09-27T14:00:31.773365+00:00
model: ollama:qwen3.8:27b
---

# scripts/setup/required-keys.ts

## Purpose

Defines the single source of truth for which environment variables `npm run setup` is allowed to auto-fill. Rather than maintaining a separate list, it reads the same `requiredConfig` entries the boot gate enforces, so a new module that declares a secret is picked up automatically without touching this file.

## Key elements

- **`FillableKey`** (interface) — a pair of `{ key, placeholder }` representing one env var the setup script may write and the exact placeholder string it replaces.
- **`fillableKeys()`** (exported function) — flattens `requiredConfig` from all enabled modules and from `APP_NON_MODULE_CHECKS`, filters to entries that carry a `placeholder`, and returns them as `FillableKey[]`.

## Relationships

- **`src/kernel/registry.ts`** — provides the `RequiredConfig` type that shapes both the input entries and the `placeholder` field used for filtering.
- **`src/modules.ts`** — supplies `enabledModules`, the set of modules whose `requiredConfig` arrays are scanned.
- **`src/app/required-config.ts`** — supplies `APP_NON_MODULE_CHECKS`, the app-level (non-module) required-config entries appended after the module entries.
- **`scripts/setup/index.ts`** — the `npm run setup` entry point; consumes `fillableKeys()` to know which variables to populate in the environment file.
- **`scripts/setup/environment-file.ts`** — writes the resolved values; relies on the `key`/`placeholder` pairs produced here to perform the actual replacement.
- **`tests/unit/scripts/setup/required-keys.test.ts`** — unit tests for the filtering and mapping logic in `fillableKeys()`.
- **`tests/unit/scripts/setup/first-run.test.ts`** — exercises the end-to-end first-run setup flow that depends on the keys returned here.

## Notes

- An entry **without** a `placeholder` (e.g. `NODE_URL`, `NODE_CORS_ORIGIN`) is deliberately excluded: those represent a *missing* value the operator must supply, not a known-wrong placeholder to replace. This distinction keeps the setup script from guessing values it has no basis for.
- The function is intentionally a thin projection over the registry data; there is no caching or memoization, so call sites get a fresh array each time.
