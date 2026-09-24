---
source: tests/unit/scripts/eslint/barrel-allowed-sources.test.ts
sha256: 187496d635b81aa4518e67f38207e839374074bbc823ed6de3dbb892c17cfd18
generated_at: 2026-09-23T20:30:14.648408+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scripts/eslint/barrel-allowed-sources.test.ts

## Purpose

Unit test for the `barrelAllowedSources` ESLint rule. Verifies that barrel files (`index.ts`) never re-export repository or wiring modules in any form, that models may only leave a barrel as types, and that the narrow `tax`-file allowance is scoped to the products module specifically. Each check (star export, named export, model-name heuristic) gets exactly one representative case rather than a table.

## Key elements

- **`RuleTester` instance** — configured with `@typescript-eslint/parser`, `ecmaVersion: 'latest'`, `sourceType: 'module'`. The TS parser is mandatory because `export type *` is TypeScript-only syntax that espree cannot parse.
- **`tester.run('barrel-allowed-sources', barrelAllowedSources as never, …)`** — runs all valid and invalid cases against the imported rule.
- **Valid cases (2):** `export type * from './model'` (types-only star export of a model is fine); `export { resolveTaxRate } from './tax'` with `filename` set to the products barrel (path-scoped allowance).
- **Invalid cases (7):** Cover star-export of model/repository, type-star export of wiring, named export of a repository value, named export of a model value by name heuristic (`userSchema`), source-less re-export resolved via the rule's import map, and the `tax` allowance denied from a different module (`delivery`).

## Relationships

- **`scripts/eslint/barrel-allowed-sources.ts`** — the rule under test; imported as `barrelAllowedSources` and passed directly to `RuleTester`.
- **`@typescript-eslint/parser`** — required parser override; without it the `export type *` valid/invalid cases would fail at parse time.
- **`eslint` (`RuleTester`)** — provides the test harness and assertion structure.

## Notes

- The rule is cast `as never` to satisfy `RuleTester`'s generic typing; this is a known workaround, not a bug.
- The `tax` allowance is enforced via the `filename` option in test cases — the rule inspects the file path it is linting, so the same code in `src/modules/delivery/index.ts` is rejected.
- The source-less re-export case (`import …; export { x };`) exercises the rule's internal import-resolution map because the export statement carries no `from` clause.
- The header comment references `comment-links.test.ts` for the rationale behind using one case per check instead of a case table.
