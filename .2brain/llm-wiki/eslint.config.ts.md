---
source: eslint.config.ts
sha256: 99917fc64510a0baaf3da28d94e0d35930625c622e70152f235dc785e4bed3aa
generated_at: 2026-10-01T12:18:40.983168+00:00
model: ollama:qwen3.8:27b
---

# eslint.config.ts

## Purpose

The flat ESLint configuration for the project. It assembles the full rule set from multiple plugins (typescript-eslint, Unicorn, Jest, JSDoc, boundaries, Prettier), defines project-specific bans via `no-restricted-syntax` / `no-restricted-imports`, and delegates file-scoped overrides to `scripts/eslint/index.ts`.

## Key elements

- **`bannedDoubleCasts`** — two `no-restricted-syntax` selectors that forbid `as unknown as T` and `as any as T`. Must be re-spread in every config block that touches `no-restricted-syntax` (that rule does not merge across blocks).
- **`bannedTryCatch`** — a `TryStatement` selector restricting production try/catch to narrow, justified spots. Same re-spread requirement.
- **`factoriesImportPattern`** — a `no-restricted-imports` regex banning `./factories`, `../factories`, and `@modules/<name>/factories` in production code.
- **`globalIgnores([...])`** — excludes foreign-runtime files (k6, mongosh), generated output (`api/`, `asyncapi.generated.ts`), build artifacts, `tmp/`, `.claude/` worktrees, and `node_modules`/`dist`.
- **`tseslint.configs.strictTypeChecked` + `stylisticTypeChecked`** — enables type-aware rules (`no-floating-promises`, `no-unnecessary-condition`, etc.) across the codebase.
- **Unicorn rule overrides** — ~40 rules explicitly set to `'off'` with inline rationale (conflicts with house style, deliberate test patterns, or opinion with no underlying bug).
- **`localRules` (from `./scripts/eslint`)** — imported and spread into the final config array; provides per-directory scoped blocks (tool configs, `src/modules/**`, `scripts/ops/**`) that re-apply the banned-syntax/import constants for their respective `no-restricted-*` entries.
- **Default export** — `tseslint.config(...)` producing the flat config array consumed by ESLint.

## Relationships

- **`scripts/eslint/index.ts`** — the sole non-npm import in this file. It exports the `localRules` array that is spread into the final config. That module contains the directory-scoped blocks (tool-config files, `src/modules/**`, `scripts/ops/**`) which must re-spread `bannedDoubleCasts`, `bannedTryCatch`, and `factoriesImportPattern` because `no-restricted-syntax` / `no-restricted-imports` replace rather than merge across config blocks.

## Notes

- **`no-restricted-syntax` and `no-restricted-imports` do not merge across flat-config blocks.** The nearest matching block's list *replaces* the outer one. Any new block that configures those rules must explicitly spread the shared constants or the ban silently lifts for the files that block covers.
- **Unicorn 76 migration:** the large block of `'off'` rules was added when adopting Unicorn 76 (~190 new recommended rules). The three groups (conflicts, deliberate, opinion) and their rationale are documented inline—do not re-enable without re-reading those comments.
- **`globalIgnores` vs. scoped blocks:** tool configs and CLI scripts are *not* ignored; they are linted through dedicated scoped blocks in `scripts/eslint/index.ts` that disable `parserOptions.project` (type-aware parsing) for just those files.
- **`tmp/` exclusion:** critical for Stryker mutation testing and Jest in-memory Mongo; without it, lint fails on sandbox copies that live outside the `tsconfig` project.
