# eslint.config.ts

## Purpose

Flat ESLint configuration for the entire project. It wires together the TypeScript type-checked rule tiers, the Unicorn and Boundaries plugins, a local rule set, and an extensive per-rule override layer whose comments record *why* each deviation from a plugin default was made. It also defines the global ignore list for generated, foreign, and tooling directories that must never be linted.

## Key elements

- **`bannedDoubleCasts`** — A standalone `no-restricted-syntax` selector list that bans `as unknown as T` and `as any as T` everywhere (tests included). Extracted to a named constant because `no-restricted-syntax` does **not** merge across flat-config blocks; every block that sets that rule must spread this array or the ban silently lifts.
- **`globalIgnores([...])`** — Ignores k6 scenarios, generated API/asyncapi clients, Stryker temp dirs, `.claude/` worktrees, `.2repo/`, coverage, `dist`, `.tmp`, and other tooling artifacts. The stated bar is "linting is impossible or meaningless," not convenience.
- **Base presets** — `js.configs.recommended`, `tseslint.configs.strictTypeChecked`, `tseslint.configs.stylisticTypeChecked`. The type-checked tiers are the reason `parserOptions.project` is set.
- **`pluginUnicorn.configs['flat/recommended']`** — Unicorn rules layer; four rules (`no-null`, `no-useless-undefined`, `no-process-exit`, `prefer-module`) are turned off entirely with inline justifications tied to the Express/Mongo/tsx stack.
- **`comments.recommended`** — Requires a description on every `eslint-disable` comment.
- **Language options block** — Sets `parserOptions.project` to `./tsconfig.json`, `globals.node`, `sourceType: 'module'`. Registers the `local` plugin (imported from `./eslint/rules`) and the `boundaries` plugin.
- **Rule overrides** — Dozens of individual rule configurations with block-level comments explaining each choice (e.g., `no-non-null-assertion` off, `restrict-template-expressions` allows numbers, `prefer-nullish-coalescing` ignores string primitives, `no-unused-vars` permits `_`-prefix, `prefer-destructuring` objects-only, `naming-convention` with `allowSingleOrDouble`, `no-confusing-void-expression` ignores arrow shorthand, etc.).

## Relationships

- **`eslint/rules/index.ts`** — Imported as `localRules` and registered under the `local` plugin key. Any rule defined there is available in this project as `local/<rule-name>`. This file is the sole consumer of that export.

## Notes

- `no-restricted-syntax` **replaces** rather than merges across flat-config blocks. If you add a new block that sets this rule, you must spread `bannedDoubleCasts` into it; otherwise the double-cast ban is silently dropped for the files matched by that block.
- The file is deliberately long and comment-heavy. Each "off" or relaxation carries a justification naming the concrete stack constraint (tsx/jest CommonJS, Mongo `null` semantics, Express handler shapes, k6 runtime, Stryker temp copies) so a future reader doesn't re-enable it without re-deriving the same conflict.
- `eslint-config-prettier` is imported but (in the visible portion) has not yet appeared in the config array — it is expected to be appended after all style/formatting rules to strip conflicts.
- The `naming-convention` block is truncated in the source; the visible comment explains that `allowSingleOrDouble` (not `allow`) is required so both `__esModule` (jest) and `__v` (Mongo) are legal while a single `_` is also permitted.
