---
source: eslint.config.ts
sha256: 682ff992e1f5e05139b9374a6b5ea18902a9ea17962173443f9c4615f7a347c5
generated_at: 2026-09-23T17:14:57.994192+00:00
model: ollama:qwen3.8:27b
---

# eslint.config.ts

## Purpose

Flat ESLint configuration for the project. It wires together TypeScript, Unicorn, Boundaries, JSDoc, Jest, Prettier, and custom local rules into a single typed config, enforcing project-specific bans (double casts, production try/catch, factories imports) on top of strict type-checked linting.

## Key elements

- **`bannedDoubleCasts`** — array of `no-restricted-syntax` selectors that reject `as unknown as T` and `as any as T` everywhere, including tests. Spread into every block that sets `no-restricted-syntax` because the rule does not merge across configs.
- **`bannedTryCatch`** — a `no-restricted-syntax` selector on `TryStatement`; production code must prefer verdicts or pipeline-level rejection handling over try/catch.
- **`factoriesImportPattern`** — `no-restricted-imports` regex banning `./factories`, `../factories`, and `@modules/<name>/factories` in `src/modules/**` and `scripts/ops/**`; keeps test-only builders out of production.
- **`globalIgnores([...])`** — excludes generated code (`api/**`, `src/types/asyncapi.generated.ts`), foreign-runtime scripts (`tests/load/**`, `docker/mongo-init.js`), Stryker sandboxes (`tmp/**`), build output, and `.claude/**` worktrees.
- **Base presets** — `js.configs.recommended`, `tseslint.configs.strictTypeChecked`, `tseslint.configs.stylisticTypeChecked`, Unicorn `flat/recommended`, and `comments.recommended` (requires a description on every `eslint-disable`).
- **Global block** — sets `parserOptions.project` to `tsconfig.json`, Node globals, registers the `local` and `boundaries` plugins, and configures the full rule set (max-depth 3, no-console warn, restrict-template-expressions with `allowNumber`, four Unicorn rules turned off with justification, `no-non-null-assertion` off, `restrict-plus-operands` allowing number+string, etc.).

## Relationships

- **`scripts/eslint/index.ts`** — imported as `localRules` and registered under `plugins.local.rules`, providing project-specific ESLint rules (e.g. `local/comment-links`) that the global block enables.

## Notes

- `no-restricted-syntax` and `no-restricted-imports` do **not** merge across config blocks — the nearest match _replaces_ the list. Every block that sets one of these rules must re-spread `bannedDoubleCasts`, `bannedTryCatch`, or `factoriesImportPattern`, or the ban silently lifts for that scope.
- `@typescript-eslint/no-non-null-assertion` is deliberately off; `!` is the sanctioned narrow claim where the compiler cannot follow a guarantee (middleware auth, `.some` guard before `.map`).
- `unicorn/prefer-module` is off because the runtime (tsx, jest) executes TS as CommonJS, making `import.meta.dirname` undefined.
- The file references `tests/support/stub.ts` (`asStub<T>`) as the one sanctioned escape hatch for test stubs, and `docs/reference/root.md` for the `max-nested-callbacks` rationale.
