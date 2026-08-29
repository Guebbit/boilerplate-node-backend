# eslint.config.ts

## Purpose

Flat (ES2024+) ESLint configuration for the project. It assembles type-checked TypeScript linting, plugin presets, project-specific rule customizations, and a global ignore list into a single exported config object consumed by `eslint` and (via `eslint-config-prettier`) kept compatible with Prettier.

## Key elements

- **`bannedDoubleCasts`** — A shared `no-restricted-syntax` entry array that bans `as unknown as T` and `as any as T`. Must be spread into every config block that sets `no-restricted-syntax`, because that rule does not merge across flat-config blocks (nearest match replaces the list).
- **`globalIgnores([...])`** — Excludes generated or foreign paths (k6 scripts, `.stryker-tmp`, `api/**` from orval, `asyncapi.generated.ts`, VitePress build output, etc.) from all linting.
- **`js.configs.recommended` + `tseslint.configs.strictTypeChecked` + `stylisticTypeChecked`** — Base JS rules and full type-aware TypeScript rules.
- **`pluginUnicorn.configs['flat/recommended']`** — Unicorn plugin recommended set.
- **`comments.recommended`** — From `@eslint-community/eslint-plugin-eslint-comments`; requires a description on every `eslint-disable` comment.
- **`local: { rules: localRules }`** — Registers the project's custom rules (imported from `./eslint/rules`) under the `local` plugin namespace.
- **`boundaries: pluginBoundaries`** — Registers the boundaries plugin for cross-layer import enforcement (config blocks below the truncated portion define the actual boundary rules).
- **`parserOptions.project`** — Points to `./tsconfig.json`, enabling all type-aware rules.
- **Rule overrides block** — Dozens of individual rule tunings with inline justifications (e.g., `no-non-null-assertion` off, `unicorn/no-null` off, `prefer-nullish-coalescing` with `ignorePrimitives.string`, `no-unused-vars` with `^_` patterns, `naming-convention` allowing single-or-double leading underscores, etc.).
- **`configPrettier`** (imported, applied in a later block beyond the truncation) — Disables rules that would conflict with Prettier.

## Relationships

- **`eslint/rules/index.ts`** — Imported as `localRules` and registered under the `local` plugin namespace. The project's custom lint rules live there; this file is the only consumer.

## Notes

- `no-restricted-syntax` does **not** merge across flat-config blocks. Any block that re-declares the rule must re-spread `bannedDoubleCasts`, or the double-cast ban silently disappears for that scope.
- The file is intentionally verbose with block comments explaining *why* each rule is turned off or tuned. These comments are load-bearing context for anyone adding a new exemption.
- `unicorn/no-process-exit` is off because `server-lifecycle.ts` calls `process.exit` deliberately after draining connections.
- `unicorn/prefer-module` is off because the project runs under tsx/jest as CommonJS; `import.meta.dirname` would be `undefined` at runtime.
- The ignore list is restricted to generated or foreign files only. Tool configs, migrations, and CLI scripts are linted via scoped config blocks that disable type-aware parsing (noted in a comment near the bottom, beyond the truncated portion).
- The file is truncated in the source snapshot; the `naming-convention` object, any `boundaries` rule definitions, the Prettier config application, and any additional scoped blocks (e.g., for tool configs or `.js`/`.mjs` files) are not visible.
