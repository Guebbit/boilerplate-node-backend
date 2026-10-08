---
source: eslint.config.ts
sha256: 46097738c45e91e506f588a201a665f64ccad763d5ffabada104fdc70f11b1cc
generated_at: 2026-10-07T23:49:02.970137+00:00
model: ollama:qwen3.8:27b
---

# eslint.config.ts

## Purpose

The project's flat ESLint configuration. It assembles the full lint rule set (base presets, type-checked tiers, plugin rules, and project-specific bans) into a single array consumed by `npm run lint`. It exists so that type-aware linting, house-style conventions, and architectural guardrails (e.g. no double-casts, no `process.env` writes in tests, no `factories.ts` imports in production) are enforced uniformly across all source files.

## Key elements

- **`bannedDoubleCasts`** — `no-restricted-syntax` selectors banning `as unknown as T` and `as any as T`; must be re-spread into every config block that sets `no-restricted-syntax` (see Notes).
- **`bannedEnvironmentWrites`** — `no-restricted-syntax` selectors banning assignment, `delete`, and `Object.assign` onto `process.env` in tests; directs developers to `tests/support/environment.ts` helpers instead.
- **`bannedTryCatch`** — `no-restricted-syntax` selector banning `TryStatement` in production code, with an opt-out escape hatch via inline `eslint-disable`.
- **`factoriesImportPattern`** — `no-restricted-imports` regex matching any import path ending in `factories`; prevents production code from importing test-only builder modules.
- **`globalIgnores([...])`** — Excludes generated output (`api/`, `dist/`, `tmp/`), foreign-runtime files (k6, mongosh, Docker build scripts), and tooling working directories (`.claude/`, `.dev/`, `.prism/`) from linting.
- **`tseslint.configs.strictTypeChecked` / `stylisticTypeChecked`** — Enables the type-aware rule tiers that power `no-floating-promises`, `no-unnecessary-condition`, etc.
- **`pluginUnicorn.configs['flat/recommended']`** plus a large block of rules explicitly set to `'off'` (contradictions, deliberate choices, and opinion-level rules).
- **`localRules` (imported from `./scripts/eslint`)** — Project-specific custom rules/plugins spread into the config.
- **`export default tseslint.config(...)`** — The assembled flat-config array; `tseslint.config` only types and flattens the arguments.

## Relationships

- **`scripts/eslint/index.ts`** — Imported as `localRules`; provides custom ESLint rules or shared rule fragments that are spread into the main config array. It is the single source for project-specific lint logic beyond the constants defined locally in this file.

## Notes

- **`no-restricted-syntax` does not merge across config blocks.** The nearest matching block *replaces* the entire list rather than appending. Every scoped block that configures this rule must re-spread `bannedDoubleCasts`, `bannedEnvironmentWrites`, or `bannedTryCatch`, or the ban silently lifts for exactly the files that block covers.
- **`no-restricted-imports` follows the same non-merging semantics.** The `factoriesImportPattern` entry must be re-included in every block that sets that rule for production files.
- **Ignore list is intentionally narrow.** The bar for adding an entry is "linting is impossible or meaningless" (foreign runtime, generated output, tooling sandbox), not merely "inconvenient." Tool configs and CLI scripts that live outside `tsconfig` are linted via scoped blocks that disable the type-aware program, not by ignoring them.
- **Prettier's off-switch (`eslint-config-prettier`) is placed last** in the array to ensure it overrides any conflicting formatting rules from plugins listed earlier.
- **Unicorn 76 off-list is exhaustive by design.** Any rule not listed either passes as-is or was fixed at adoption time; adding new off-rules should be accompanied by a justification matching one of the three documented categories (contradiction, deliberate, opinion).
