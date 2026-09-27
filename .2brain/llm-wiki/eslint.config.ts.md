---
source: eslint.config.ts
sha256: a788fba38cee705753ad7c69098c59efac711603bb79de49d0aa00ce627eac14
generated_at: 2026-09-27T13:48:16.305023+00:00
model: ollama:qwen3.8:27b
---

# eslint.config.ts

## Purpose

The project's flat ESLint configuration. It assembles the type-checked TypeScript rule set, plugin presets, banned-syntax restrictions, and global ignores into a single entry point consumed by `npm run lint`. The file's inline comments are load-bearing: they record *why* each rule is enabled, disabled, or shaped as it is, so future changes are an argument rather than a guess.

## Key elements

- **`bannedDoubleCasts`** — `no-restricted-syntax` selectors banning `as unknown as T` and `as any as T`. Because `no-restricted-syntax` does not merge across config blocks (nearest match replaces), this array is spread into every block that sets that rule.
- **`bannedTryCatch`** — A `TryStatement` selector restricting bare `try/catch` in production code to cases with no safe wrapper and a local answer.
- **`factoriesImportPattern`** — A `no-restricted-imports` regex blocking `./factories`, `../factories`, and `@modules/<name>/factories` in production code (builders are test/scenario-only).
- **`globalIgnores([...])`** — Generated or foreign files excluded from linting (k6 scripts, Docker init scripts, `node_modules`, `dist`, VitePress output, `tmp/`, orval/asyncapi generated files, `.claude/` worktrees).
- **Base presets** — `js.configs.recommended`, `tseslint.configs.strictTypeChecked`, `tseslint.configs.stylisticTypeChecked`, `pluginUnicorn.configs['flat/recommended']`, `comments.recommended` (forces `eslint-disable` comments to include a description).
- **`local` plugin** — Registers rules imported from `scripts/eslint/index.ts` as `local/<rule-name>`.
- **`boundaries` plugin** — Layer/architecture boundary enforcement.
- **`no-restricted-imports` / `no-restricted-syntax` / `max-depth` / `@typescript-eslint/*`** — Global rule block with per-rule justification comments (e.g., `no-non-null-assertion` is off because `!` is the narrowest honest claim; four `unicorn` rules are off because they disagree with the stack, not the code).

## Relationships

- **`scripts/eslint/index.ts`** — Imported as `localRules`; its rules are exposed to ESLint under the `local` plugin namespace (e.g. `local/comment-links`). This file is the sole consumer.
- **`eslint-config-prettier`** — Imported as `configPrettier` (likely spread later in the truncated portion) to disable rules that conflict with Prettier formatting.

## Notes

- **`no-restricted-syntax` does not merge across config blocks.** The nearest matching block *replaces* the list. Every subsequent block that sets this rule must re-spread `bannedDoubleCasts` (and `bannedTryCatch`) explicitly, or the ban silently lifts for the files that block covers. The same non-merging applies to `no-restricted-imports`.
- **`parserOptions.project`** is set to the root `tsconfig.json`. Files outside that project (tool scripts, CLI helpers) are linted via scoped blocks lower in the config that turn off the type-aware program rather than the linter entirely.
- **`eslint-disable` requires a description** (enforced by `@eslint-community/eslint-plugin-eslint-comments`). The project-local rules and the `TryStatement` ban are intentionally strict; a bare disable converts "deliberately annoying" into "silently ignored."
- **`unicorn/prefer-module` is off** because the stack runs as CommonJS under `tsx` and `jest`; `import.meta.dirname` would be `undefined` at runtime. Fifty findings would each be a rename into a crash.
- The file is a single default export of `tseslint.config(...)`; there are no named exports.
