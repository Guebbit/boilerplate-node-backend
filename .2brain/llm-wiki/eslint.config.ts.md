---
source: eslint.config.ts
sha256: 475dfdb03be5197b2f80d3e89a87969689817189fc118e5cbf93cfaa1f651992
generated_at: 2026-11-14T17:13:02.402521+00:00
model: ollama:qwen3.8:27b
---

# eslint.config.ts

## Purpose

The project's ESLint flat-config entry point. It assembles a single `defineConfig` array that layers a shared rule set (TypeScript type-checked, Unicorn, RegExp, Prettier off-switch) with scoped overrides for tests, scripts, and generated/foreign files, and inlines several project-specific architectural bans (double casts, `process.env` writes in tests, production `try/catch`, `factories.ts` imports) directly as AST-selector rules.

## Key elements

- **`bannedDoubleCasts`** — two `no-restricted-syntax` selectors that forbid `as unknown as T` and `as any as T` everywhere; must be spread into every block that configures `no-restricted-syntax` because that rule does not merge across configs.
- **`bannedEnvironmentWrites`** — four selectors banning assignment, replacement, `delete`, and `Object.assign` onto `process.env` in test files; directs developers to `tests/support/environment.ts` instead.
- **`bannedTryCatch`** — a single `TryStatement` selector banning `try/catch` in production code; must be spread into every relevant block for the same non-merging reason.
- **`factoriesImportPattern`** — a `no-restricted-imports` regex (`(^|/)factories$`) that blocks importing any `factories.ts` builder from production files, since those files are deleted from the production image.
- **`sideEffectMessage`** — small helper that formats the message for side-effect import bans outside the service layer.
- **`globalIgnores([...])`** — excludes generated/foreign paths (`api/`, `tmp/`, k6 scripts, docker init scripts, `.claude/`, etc.) from linting entirely.
- **`defineConfig(...)` export** — the default export; assembles the full config array in order: ignores → base presets (`js.configs.recommended`, `tseslint.configs.strictTypeChecked`, `tseslint.configs.stylisticTypeChecked`) → plugin configs (Unicorn, Regexp) → per-rule overrides (Unicorn off-list, etc.) → scoped blocks (tests, scripts, tool configs) → `configPrettier` last.
- **`localRules`** (from `./scripts/eslint`) — imported and spread into the config to add project-specific rule definitions.

## Relationships

- **`scripts/eslint/index.ts`** — imported as `localRules`; provides additional rule definitions (or shared selector helpers) that are merged into the main config array. The config depends on it at module-load time.

## Notes

- `no-restricted-syntax` and `no-restricted-imports` **do not merge** across flat-config blocks — the nearest block that sets them *replaces* the list. Every scoped block that configures those rules must explicitly re-spread `bannedDoubleCasts`, `bannedTryCatch`, `bannedEnvironmentWrites`, or `factoriesImportPattern`, or the ban silently lifts for the files that block covers.
- `defineConfig` from `eslint/config` is used instead of the deprecated `tseslint.config`; it types, flattens, and resolves `extends`.
- Type-aware rules (`no-floating-promises`, `no-unnecessary-condition`, etc.) are enabled via `strictTypeChecked` / `stylisticTypeChecked`; they rely on `parserOptions.project` resolving against the tsconfig, which is why paths outside the project (`.claude/`, `tmp/`, Stryker sandboxes) must be in `globalIgnores`.
- The Prettier config is intentionally placed **last** in the array so its rule-disable entries override any earlier plugin that sets conflicting formatting rules.
