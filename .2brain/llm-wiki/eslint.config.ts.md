---
source: eslint.config.ts
sha256: 3aac14a65ae49d8c50f7ed90d4c72a4131e774a6937625aed020fdda49e2c9f2
generated_at: 2026-10-14T14:29:51.440016+00:00
model: ollama:qwen3.8:27b
---

# eslint.config.ts

## Purpose

The project's ESLint flat configuration. It assembles the rule set (base JS/TS presets, Unicorn, boundaries, JSDoc, Jest, eslint-comments), defines project-specific AST-level bans (double casts, `process.env` writes in tests, try/catch in production, test-factory imports in production), scopes rule overrides for non-source files (scripts, tool configs, tests), and ends with Prettier's off-switch. It exists to encode the team's conventions as enforceable checks rather than style-guide paragraphs.

## Key elements

- **`bannedDoubleCasts`** — Two `no-restricted-syntax` selectors that ban `as unknown as T` and `as any as T`. Message points to `.lean<T>()` or `asStub<T>()` as sanctioned alternatives.
- **`bannedEnvironmentWrites`** — Four `no-restricted-syntax` selectors banning assignment, replacement, `delete`, and `Object.assign` onto `process.env` in test files. Points to `setEnvironment` / `withEnvironment` from `tests/support/environment.ts`.
- **`bannedTryCatch`** — A `no-restricted-syntax` selector banning `TryStatement` in production code; requires a per-line disable with justification if truly needed.
- **`factoriesImportPattern`** — A `no-restricted-imports` regex (`(^|/)factories$`) banning imports of any `factories.ts` builder in production files, since the production image deletes those files.
- **`export default tseslint.config(…)`** — The flat-config array. Order: `globalIgnores` → `js.configs.recommended` → `tseslint` strict/stylistic type-checked → Unicorn (with ~40 rules turned off, documented inline) → plugin blocks (boundaries, jsdoc, jest, eslint-comments) → scoped per-directory overrides (tests, scripts, tool configs) → `configPrettier` last.
- **`globalIgnores([...])`** — Excludes only generated or foreign-runtime files (k6 load tests, `docker/mongo-init.js`, `docker/install-supercronic.mjs`, `node_modules`, `dist`, VitePress build output, `tmp/`, orval-generated `api/`, `.prism/`, `.dev/`, `.claude/` worktrees).

## Relationships

- **`scripts/eslint/index.ts`** — Imported as `localRules` (via `./scripts/eslint`). Supplies project-specific rules or rule-configuration fragments that the main config spreads into the flat array.

## Notes

- **`no-restricted-syntax` and `no-restricted-imports` do not merge across config objects** — the nearest matching block *replaces* the list. Every scoped block that sets one of these rules must re-spread the shared ban arrays (`bannedDoubleCasts`, `bannedEnvironmentWrites`, `bannedTryCatch`, `factoriesImportPattern`), or the ban silently lifts for the files that block covers.
- **Prettier is last** so it acts as a pure off-switch for any conflicting stylistic rules set by earlier blocks.
- **Type-checked tiers** (`strictTypeChecked`, `stylisticTypeChecked`) require `parserOptions.project`; the scoped blocks for non-project files (scripts, tool configs) switch off the type-aware parser rather than the whole linter.
- The ignore list is intentionally narrow: files that are *ours* but outside `tsconfig` are still linted (via scoped blocks), not ignored. The bar for an ignore entry is "linting is impossible or meaningless," not "inconvenient."
