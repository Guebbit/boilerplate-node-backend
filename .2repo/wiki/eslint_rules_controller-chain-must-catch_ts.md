# eslint/rules/controller-chain-must-catch.ts

## Purpose

A custom ESLint rule that enforces every promise chain started in a controller (exported handler) ends in `.catch()`. It exists because Express does nothing with a returned promise, so the global error handler in `app.ts` catches unhandled rejections but cannot perform cleanup (e.g., orphaned uploads) or record domain metrics, and it reports a generic 500 even for client-input errors.

## Key elements

- **`chainMethods(call)`** — Walks a `CallExpression` upward through `.MemberExpression` wrappers and returns the list of method names from outermost to innermost (e.g. `['catch', 'then']`).
- **`HANDLER_METHODS`** — A `Set` of `['then', 'catch', 'finally']` used to identify promise-handler callbacks.
- **`insidePromiseHandler(node)`** — Walks up the AST; returns `true` if the node sits inside a function expression passed as an argument to any of the handler methods. Used to suppress reporting on chains that already reject into an outer chain's `.catch()`.
- **`insideExportedFunction(node)`** — Finds the outermost enclosing function and checks whether its declaration is directly owned by an `ExportNamedDeclaration` or `ExportDefaultDeclaration`. Restricts the rule to module-level exported handlers only.
- **`controllerChainMustCatch`** (exported) — The rule object (`meta` + `create`). The visitor inspects `CallExpression` nodes, skips inner links of a chain, then reports if the chain uses `.then` but not `.catch` and is inside an exported function but not inside a promise handler.

## Relationships

- **`eslint/rules/index.ts`** — Imports and re-exports `controllerChainMustCatch` so it can be registered in a project's ESLint config.
- **`tests/unit/eslint/controller-chain-must-catch.test.ts`** — Unit-tests the rule via `RuleTester`, covering positive cases (missing `.catch` in exported handlers) and negative cases (chains inside `.then`/`.catch` callbacks, non-exported helpers, chains that already end in `.catch`).

## Notes

- The rule deliberately does **not** flag private helper functions that return a promise chain (e.g., a helper in `post-reset-request.ts`). The contract is that the *caller's* exported handler owns the `.catch()`, and that `.catch()` may intentionally swallow the error to keep the response identical.
- Only the **outermost** call of a chain is evaluated (the visitor early-returns when the node is the `.object` of a parent `MemberExpression`). This avoids duplicate reports for multi-link chains.
- The rule fires only when the chain contains `.then` but not `.catch`. A bare `await` or a chain that is only `.finally` will not be flagged.
- `meta.type` is `'problem'` (not `'suggestion'`), signaling that missing `.catch()` is treated as a bug rather than a style preference.
