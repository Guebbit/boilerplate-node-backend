---
source: eslint.config.ts
source_sha256: 7043a69a7989b09ccaa980565efc807a4b050327b0fefed24a56bacc514491d9
context_sha256: baf65e8ef624d919a5c5011280aad1d0465d89eaa8f78e9f871f86855c29c327
generated_at: 2026-11-22T01:35:28.834249+00:00
model: claude-code:claude-sonnet-5-5
---

# eslint.config.ts

## Purpose
The project's ESLint flat configuration. It exports one `defineConfig(...)` array: global ignores first, then the shared rule set (ESLint recommended, typescript-eslint strict and stylistic type-checked tiers, and several plugins), then scoped blocks that adjust it, with Prettier's off-switch last. Type-aware rules run because `parserOptions.project` is set.

## Key elements
- **Default export (`defineConfig(...)`)**: the whole lint configuration. `defineConfig` replaces the deprecated `tseslint.config`.
- **`globalIgnores([...])`**: excludes generated or foreign files only:
  - `tests/load/**` (k6 scripts)
  - `docker/mongo-init.js`
  - `docker/install-supercronic.mjs`
  - `node_modules`, `dist`
  - the VitePress dist and cache
  - `tmp/**`
  - `api.generated/**`
  - a generated AsyncAPI types file under `src/types/`
  - `.prism`, `.dev`, `.claude`, `.2brain`, `.work`
- **Presets and plugins in view**:
  - `js.configs.recommended`
  - `tseslint.configs.strictTypeChecked` and `stylisticTypeChecked`
  - `pluginUnicorn.configs.recommended`
  - `pluginRegexp`
  - Imported but not used in the visible part: `globals`, `configPrettier`, `pluginBoundaries`, `pluginJsdoc`, `pluginJest`, `pluginStylistic`, `comments`, `path`.
- **`localRules`**: imported from `./scripts/eslint`.
- **Shared selector constants** for `padding-line-between-statements`:
  - `TOP_LEVEL_DECLARATION`: top-level const, function, class, type, interface, enum and export declarations. Imports and bare re-exports are excluded.
  - `TOP_LEVEL_STATEMENT`: `Program > *`.
  - `TOP_LEVEL_OVERLOAD`: overload signatures, so no blank line is required between them and the implementation.
- **Shared `no-restricted-syntax` and `no-restricted-imports` entries**:
  - `bannedDoubleCasts`: bans `as unknown as T` and `as any as T`. The only sanctioned test seam is the `asStub<T>()` helper.
  - `bannedEnvironmentWrites`: bans assigning, replacing, deleting or `Object.assign`-ing `process.env` in tests. Tests should use `setEnvironment` / `withEnvironment` from `@tests/environment`.
  - `bannedTryCatch`: bans `TryStatement` in production code.
  - `factoriesImportPattern`: a regex (`(^|/)factories$`) that bans importing `factories` modules from production code.
- **`sideEffectMessage(what)`**: builds the lint message for side-effect imports banned outside the service layer.

## Relationships
- Imports `localRules` from `./scripts/eslint` (`scripts/eslint/index.ts`), which provides the project's custom ESLint rules.

## Notes
- `no-restricted-syntax` and `no-restricted-imports` do not merge across config blocks, because the nearest match replaces the list. Every block that configures them must spread in the shared constants (`bannedDoubleCasts`, `bannedEnvironmentWrites`, `bannedTryCatch`, `factoriesImportPattern`). Otherwise the ban silently lifts for those files.
- `factories.ts` files are deleted from the production image, so production imports of them would crash at boot.
- The ignore list is for generated or foreign files only. Tool configs and CLI scripts sit outside the `tsconfig` project but are still linted, through scoped blocks near the bottom that switch off the type-aware program.
- `tmp/**` and `.claude/**` are ignored because Stryker sandboxes and git worktrees sit outside the `tsconfig` project. Linting them would throw parser errors.
- An explicit ignore list is used instead of `includeIgnoreFile`, so gitignored generated `.ts` files under `src/` and `scenarios/` are still linted.
