---
source: eslint.config.ts
sha256: ca40371a051f970805446591d87d546d031f005b547bc10bde017b487da2da77
generated_at: 2026-10-29T01:19:33.323381+00:00
model: ollama:qwen3.8:27b
---

# eslint.config.ts

## Purpose

The ESLint flat-config entry point for the entire project. It composes presets (ESLint recommended, typescript-eslint strict/stylistic type-checked, Unicorn, Prettier off-switch), defines project-specific banned-syntax rules as reusable arrays, and layers scoped overrides for tests, scripts, and generated files. It exists so that `npm run lint` enforces a single, consistent rule set across all source with no per-directory `.eslintrc` files.

## Key elements

- **`bannedDoubleCasts`** — array of `no-restricted-syntax` selectors that reject `as unknown as T` and `as any as T` casts project-wide; points to `asStub<T>()` as the sole sanctioned escape hatch.
- **`bannedEnvironmentWrites`** — selectors rejecting assignment, `delete`, and `Object.assign` onto `process.env` inside test files; directs tests to `setEnvironment` / `withEnvironment` from `@tests/environment`.
- **`bannedTryCatch`** — a single `TryStatement` selector that forbids `try/catch` in production code unless a specific exception is warranted.
- **`factoriesImportPattern`** — a `no-restricted-imports` regex (`(^|/)factories$`) blocking any import of a `factories.ts` builder from production code (the production Docker image deletes those files).
- **`globalIgnores([...])`** — excludes k6 scripts, Mongo init, Docker build scripts, `node_modules`, `dist`, VitePress build output, `tmp/`, orval-generated `api/`, the generated AsyncAPI type, and `.claude/` worktrees.
- **`tseslint.config(...)`** — the default-exported flat-config array: ignores → `js.configs.recommended` → `tseslint.configs.strictTypeChecked` → `tseslint.configs.stylisticTypeChecked` → `pluginUnicorn.configs['flat/recommended']` → Unicorn rule overrides → (truncated: further scoped blocks, boundaries, jsdoc, jest, eslint-comments, local rules, `configPrettier`).
- **`localRules`** (from `./scripts/eslint`) — project-specific rule additions imported from the scripts directory.

## Relationships

- **`scripts/eslint/index.ts`** — imported as `localRules`; supplies project-specific ESLint rules that are layered into the flat-config array (likely scoped blocks for `scripts/` and tooling files that need type-aware rules switched off).

## Notes

- `no-restricted-syntax` does **not** merge across config blocks — the nearest match *replaces* the list. Every scoped block that configures that rule must re-spread the relevant banned-pattern array (e.g. `bannedDoubleCasts`, `bannedEnvironmentWrites`, `bannedTryCatch`), or the ban silently lifts for the files that block covers.
- The same non-merging caveat applies to `no-restricted-imports`, which is why `factoriesImportPattern` is spread into each production-scoped block.
- Type-checked presets (`strictTypeChecked`, `stylisticTypeChecked`) require `parserOptions.project` to be set; files outside the `tsconfig` project (tool configs, CLI scripts) are handled by scoped blocks that swap in a non-type-aware parser rather than by global ignores.
- `globalIgnores` intentionally excludes only *generated or foreign* files; tool configs and `scripts/` remain linted.
- The Prettier off-switch (`eslint-config-prettier`) is placed last in the array so it can disable conflicting stylistic rules.
