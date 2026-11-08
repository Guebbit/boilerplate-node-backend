---
source: eslint.config.ts
sha256: fcd5dd524041b967494c8766b10085e9ffc39b57c76862e8ebcd0e90a3cb5796
generated_at: 2026-11-08T02:25:03.341105+00:00
model: ollama:qwen3.8:27b
---

# eslint.config.ts

## Purpose

Flat ESLint configuration for the entire codebase. It assembles the base presets, plugin rule sets, scoped per-directory overrides, and custom `no-restricted-syntax` / `no-restricted-imports` bans into a single array via `tseslint.config()`. It exists so that `npm run lint` enforces one consistent rule set while allowing targeted adjustments for tests, scripts, and tooling.

## Key elements

- **`bannedDoubleCasts`** — `no-restricted-syntax` entries that block `as unknown as T` and `as any as T`. Must be re-spread into every config block that sets `no-restricted-syntax`, because that rule does not merge across flat-config entries.
- **`bannedEnvironmentWrites`** — `no-restricted-syntax` entries blocking assignment, `delete`, and `Object.assign` on `process.env` in tests. Directs developers to `tests/support/environment.ts` instead.
- **`bannedTryCatch`** — A single `no-restricted-syntax` selector on `TryStatement` that bans `try/catch` in production code by default.
- **`factoriesImportPattern`** — A `no-restricted-imports` regex (`(^|/)factories$`) preventing production files from importing any `factories.ts` builder, since those files are deleted from the production image.
- **`globalIgnores([...])`** — Excludes generated output (`api/`, `dist/`), foreign-runtime scripts (k6, mongosh), Stryker sandboxes (`tmp/`), `.claude/` worktrees, and other non-project paths.
- **`js.configs.recommended` / `tseslint.configs.strictTypeChecked` / `stylisticTypeChecked`** — Base presets; the type-checked tiers enable type-aware rules (`no-floating-promises`, `no-misused-promises`, `no-unnecessary-condition`) at near-zero extra cost.
- **Unicorn rule overrides** — A large `rules` block turning off ~35 `unicorn/*` rules with a rationale comment for each (contradiction with house style, deliberate test choice, or "opinion, no bug").
- **`localRules`** (from `./scripts/eslint`) — Project-specific rule definitions imported and spread into the config.
- **`configPrettier`** — Placed last to switch off any stylistic rules that conflict with Prettier.
- **Scoped blocks** (truncated in sample) — Per-directory `overrides` that adjust rules for `tests/`, `scripts/`, `docs/`, `docker/`, etc., and re-spread the custom bans listed above.

## Relationships

- **`scripts/eslint/index.ts`** — Imported as `localRules`; supplies the project-specific ESLint rules (custom rule definitions, shared selector helpers) that this file spreads into the flat-config array.

## Notes

- **`no-restricted-syntax` does not merge across flat-config entries.** The nearest entry with that rule *replaces* the list. Every block that configures it must explicitly re-spread `bannedDoubleCasts`, `bannedEnvironmentWrites`, and `bannedTryCatch`, or the ban silently disappears for the files that block covers.
- The sanctioned escape hatch for test stubs that need a double cast is `asStub<T>()` from `tests/support/stub.ts`; the error messages point there.
- Test environment overrides go through `setEnvironment` / `withEnvironment` from `@tests/environment`, not direct `process.env` mutation, because the config store reads the environment exactly once at import.
- `globalIgnores` is intentionally narrow: only genuinely foreign or generated files. Tool configs and CLI scripts are still linted via scoped blocks that disable type-aware parsing rather than skipping the linter entirely.
- The file is a flat-config array, not a single object; order matters (Prettier's off-switch must come after all stylistic presets).
