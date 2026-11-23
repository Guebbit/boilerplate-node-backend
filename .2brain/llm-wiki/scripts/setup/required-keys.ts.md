---
source: scripts/setup/required-keys.ts
source_sha256: 8230f2ba05b4b48b0ad4c8eac87ce72c6f9a176f877f253343e49bed87f410d9
context_sha256: ad70f1c0520f7c2aeecc24ec4a92636fbbf43b49e00998697cde51bbe4c80c6b
generated_at: 2026-11-22T02:18:21.526716+00:00
model: claude-code:claude-sonnet-5-5
---

# scripts/setup/required-keys.ts

## Purpose
Computes the list of environment variables that `npm run setup` is able to fill in. It reuses the boot gate's own config definitions instead of keeping a separate list, so a new module's secret is picked up automatically.

## Key elements
- `FillableKey` (interface): `{ key, placeholder }`. `key` is the env var name. `placeholder` is the exact text in `.env` that marks the variable as unset.
- `fillableKeys()`: returns `FillableKey[]`. It goes through every field of every slice from `allConfigSlices(enabledModules)`. A field is kept only if its `presence` rule has a `placeholder`. Results are de-duplicated by name using a `Map`, so if the same name appears again, the later placeholder replaces the earlier one.

## Relationships
- Imports `allConfigSlices` from `src/app/config.ts`. This supplies the app-level and module-declared config slices.
- Imports `enabledModules` from `src/modules.ts`. This restricts the scan to modules that are enabled.
- Its consumers are the sibling setup scripts (`environment-file.ts`, `index.ts`). Their tests, `required-keys.test.ts` and `first-run.test.ts`, are also graph neighbors. None of these files appear in the content shown, so the exact usage isn't visible here.

## Notes
- Fields whose presence rule has no `placeholder` are excluded, for example `NODE_URL` and `NODE_CORS_ORIGIN`. They name no wrong value to replace, only a missing one, so they stay the operator's own call.
- The module doc says this mirrors how `assertModuleConfig` (`src/kernel/module-config.ts`) folds module-declared and app-level slices together.
