---
source: scripts/eslint/controller-chain-must-catch.ts
sha256: 9d19c3720059eb89f6bc7c50418720a9e118bce0448828ac6e9e81387ab47a9e
generated_at: 2026-11-08T02:50:33.935036+00:00
model: ollama:qwen3.8:27b
---

# scripts/eslint/controller-chain-must-catch.ts

## Purpose

A custom ESLint rule that flags promise chains in exported controller functions which call `.then()` but never terminate with `.catch()`. It exists because the global error handler in `app.ts` converts unhandled rejections into generic 500s, masking client errors as server faults, and because that net cannot perform per-domain cleanup (orphaned uploads) or record domain-specific metrics (failed checkouts).

## Key elements

- **`controllerChainMustCatch`** — The exported rule (created via `RuleCreator.withoutDocs`). Reports a single message (`missing`) on the outermost call of a chain that includes `.then` but not `.catch`, is inside an exported function, and is not already governed by an outer handler.
- **`chainMethods(call)`** — Walks inward from an outermost `CallExpression` collecting member-access names (e.g. `['then','then']`), stopping when the callee is no longer a `MemberExpression`.
- **`HANDLER_METHODS`** — `Set` of `'then' | 'catch' | 'finally'`; used to identify promise-handler callback boundaries.
- **`isPromiseCallbackFunction(node)`** — Type guard: node is an `ArrowFunctionExpression` or `FunctionExpression`.
- **`insidePromiseHandler(node, parentOf)`** — Walks up ancestors; returns `true` if the chain sits inside a callback passed to any of the handler methods, meaning its rejection is already caught by the owning chain.
- **`isEnclosingFunction(node)`** — Type guard covering `ArrowFunctionExpression`, `FunctionExpression`, and `FunctionDeclaration`.
- **`grandparentOf(node, parentOf)`** — Two-level parent lookup (used to resolve a `VariableDeclarator` up to its `VariableDeclaration`).
- **`insideExportedFunction(node, parentOf)`** — Walks up to find the outermost enclosing function, then checks whether that function is the target of an `ExportNamedDeclaration` or `ExportDefaultDeclaration`. Only exported (controller) functions are required to catch; private helpers delegate to their caller.
- **`ParentOf`** — Type alias for `(node) => node | undefined`; a per-visit parent resolver built from `context.sourceCode.getAncestors()` because TSESTree does not type a `.parent` link.

## Relationships

- **`scripts/eslint/index.ts`** — Registers this rule in the project's custom ESLint plugin so it can be enabled in `.eslintrc` / flat config.
- **`tests/unit/scripts/eslint/controller-chain-must-catch.test.ts`** — Unit tests that exercise the rule's `valid` / `invalid` cases against representative controller and helper code.

## Notes

- **Outermost-call guard:** The rule skips any `CallExpression` whose parent is a `MemberExpression` with `object === node`, so an inner `.then` within the same chain is not reported a second time.
- **Exported-function scope:** Private helper functions that return a chain (e.g. in `post-reset-request.ts`) are deliberately exempt; their caller owns the `.catch`.
- **Parent resolution:** A `Map` of parent links is built once per visited `CallExpression` from `getAncestors()` (which returns nodes from `Program` down to the node's immediate parent). This avoids repeated ancestor walks and works around TSESTree's missing typed `.parent`.
- **No options:** `Options` is `[]`; the rule has a single fixed message and no tunable configuration.
