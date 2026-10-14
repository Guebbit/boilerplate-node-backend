---
source: scripts/eslint/controller-chain-must-catch.ts
sha256: 9d19c3720059eb89f6bc7c50418720a9e118bce0448828ac6e9e81387ab47a9e
generated_at: 2026-10-14T07:18:26.822194+00:00
model: ollama:qwen3.8:27b
---

# scripts/eslint/controller-chain-must-catch.ts

## Purpose

A custom ESLint rule that enforces promise chains in controller functions must terminate with `.catch()`. It exists because the global error handler in `app.ts` returns a client-shaped 500 for unhandled rejections, masking what should be a 400 (or a domain-specific response), and preventing cleanup (e.g., deleting an orphaned upload) and domain metrics (e.g., a failed-checkout counter).

## Key elements

- **`controllerChainMustCatch`** (exported) — The ESLint rule. On each `CallExpression`, it checks: is this the outermost call of a chain containing `.then` but no `.catch`, sitting in an exported function, and not already inside another promise handler callback? If so, reports `missing`.
- **`chainMethods(call)`** — Walks a call expression inward (outermost → innermost) collecting member-access method names, e.g. `["then", "then"]` for `a.then(...).then(...)`.
- **`insidePromiseHandler(node, parentOf)`** — Returns true if the chain is written inside a `.then`/`.catch`/`.finally` callback, meaning an outer chain's `.catch` already governs it.
- **`insideExportedFunction(node, parentOf)`** — Returns true only if the nearest enclosing function is the module's named or default export (i.e., the actual Express handler). Private helpers that return chains are exempt because they delegate to the caller's `.catch`.
- **`ParentOf`** — A `(node) => Node | undefined` lookup built per-visit from `context.sourceCode.getAncestors()`, substituting for TSESTree's untyped `.parent` link.
- **`HANDLER_METHODS`** — `Set(['then', 'catch', 'finally'])`; the method names that identify a promise-handler call site.

## Relationships

- **`scripts/eslint/index.ts`** — Registers this rule in the local ESLint plugin's rule set, making it available to the project's lint config.
- **`tests/unit/scripts/eslint/controller-chain-must-catch.test.ts`** — Unit-tests the rule via ESLint's `RuleTester`, covering positive (missing `.catch`) and negative (already caught, inside a handler, non-exported helper) cases.

## Notes

- The rule intentionally fires **only** on the outermost call of a chain. Inner `.then` links in the same expression are skipped to avoid duplicate reports.
- The "exported function" check means a private helper like `post-reset-request.ts` that returns a chain is **not** flagged; the caller's `.catch` is the designated swallow point.
- `ParentOf` is rebuilt on every `CallExpression` visit from `getAncestors()`. This is per-node overhead but keeps the logic local and avoids a global AST pass.
- The rule type is `'problem'` (not `'suggestion'`), reflecting that a missing `.catch` in a controller is a correctness bug, not a style preference.
