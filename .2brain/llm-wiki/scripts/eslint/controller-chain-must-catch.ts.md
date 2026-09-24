---
source: scripts/eslint/controller-chain-must-catch.ts
sha256: 8f98d6b2a3569b1cca642cc151aa58cabbda670457f1bec9aba8aacdca51c875
generated_at: 2026-09-23T17:26:59.234401+00:00
model: ollama:qwen3.8:27b
---

# scripts/eslint/controller-chain-must-catch.ts

## Purpose

A custom ESLint rule that requires promise chains started in exported controller handlers to end in `.catch()`. It exists because the global error handler in `app.ts` can only return a generic status code—it cannot clean up orphaned resources (e.g., failed uploads) or record domain-specific metrics (e.g., failed-checkout counters) that a local `.catch()` would handle.

## Key elements

- **`controllerChainMustCatch`** (exported) — The ESLint rule created via `RuleCreator.withoutDocs`. Reports `messageId: 'missing'` on the outermost `CallExpression` of a chain that contains `.then` but no `.catch`, is inside an exported function, and is not already governed by an outer handler.
- **`chainMethods(call)`** — Walks a call expression inward (outermost → innermost) and returns the array of method names (e.g. `['then','catch']`).
- **`HANDLER_METHODS`** — `Set(['then','catch','finally'])`; identifies which calls constitute a promise handler callback.
- **`isPromiseCallbackFunction(node)`** — Type guard: `ArrowFunctionExpression` or `FunctionExpression` that could be a `.then`/`.catch` callback.
- **`insidePromiseHandler(node, parentOf)`** — Walks ancestors to detect whether the chain is written *inside* another chain's handler (e.g. a cleanup call in `.catch(err => …)`), meaning it already inherits a `.catch`.
- **`isEnclosingFunction(node)`** — Type guard covering all three function shapes (arrow, expression, declaration).
- **`grandparentOf(node, parentOf)`** — Utility: returns the node two levels above `node` (used for `VariableDeclaration` → `ExportNamedDeclaration` lookup).
- **`insideExportedFunction(node, parentOf)`** — Finds the outermost enclosing function and checks whether its owner is an `ExportNamedDeclaration` or `ExportDefaultDeclaration`; only those are Express handlers.
- **`ParentOf`** (type) — Signature for the per-call parent-lookup function built from `context.sourceCode.getAncestors()`, compensating for TSESTree's untyped `.parent` link.

## Relationships

- **`scripts/eslint/index.ts`** — Imports and registers `controllerChainMustCatch` so it is available as a plugin rule in the project's ESLint config.
- **`tests/unit/scripts/eslint/controller-chain-must-catch.test.ts`** — Unit tests that exercise the rule against fixture code (valid/invalid chains, nested handlers, exported vs. private functions).

## Notes

- The rule fires only on the **outermost** call of a chain. An inner `.then` whose parent `MemberExpression.object` is the current node is skipped, preventing duplicate reports.
- A chain that contains `.catch` anywhere is considered compliant, even if a later `.then` follows it.
- Private helper functions (non-exported) are **exempt** by design: their caller is expected to attach the `.catch()`.
- The parent map is rebuilt per visited `CallExpression` via `getAncestors`; this is intentional because TSESTree does not expose a typed `.parent` pointer on nodes.
- The rule uses `RuleCreator.withoutDocs`—it carries no `recommended` or `docs.recommended` flag, so it must be enabled explicitly in the ESLint config.
