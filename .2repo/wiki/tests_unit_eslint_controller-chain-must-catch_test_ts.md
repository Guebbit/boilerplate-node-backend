# tests/unit/eslint/controller-chain-must-catch.test.ts

## Purpose

Unit test for the `controller-chain-must-catch` ESLint rule, exercised via ESLint's own `RuleTester`. It asserts that the rule correctly flags controller handlers with an unhandled `.then()` chain and correctly allows the rule's documented carve-outs (chains inside `.catch` handlers, private helpers delegating `.catch` to the caller). Running through `RuleTester` means the rule receives a real parsed AST, matching production lint behavior.

## Key elements

- **`tester`** — A `RuleTester` instance configured with `ecmaVersion: 'latest'` and `sourceType: 'module'`.
- **`tester.run('controller-chain-must-catch', …)`** — Top-level invocation that registers the test suite. Contains:
  - **`valid`** (5 cases): happy path with `.catch`, `.finally` after `.catch`, a chain nested inside a `.catch` handler, a private helper returning a chain (delegates catch to caller), and a non-chain function (no `.then`).
  - **`invalid`** (2 cases): exported arrow-function handler and exported `function` declaration, both with a `.then` but no `.catch`. Both expect `messageId: 'missing'`.
- **Import of `controllerChainMustCatch`** — The rule under test, imported from `eslint/rules/controller-chain-must-catch.ts` and cast `as never` to satisfy `RuleTester`'s typing.

## Relationships

- **`eslint/rules/controller-chain-must-catch.ts`** — The sole subject under test. The test asserts against the rule's `messageId` (`'missing'`) and its documented carve-out behavior; any change to the rule's AST-walking logic or message definitions must keep these cases in sync.

## Notes

- `tester.run` is called at **top level** (not inside a `describe`/`it`). `RuleTester` emits its own `describe`/`it` blocks, and Jest rejects nested describes, so wrapping it would break the test run.
- The `as never` cast on the rule import is a TypeScript workaround; `RuleTester.run` expects an `eslint`-typed rule, but the project's rule export may not structurally match that type.
- The valid cases are deliberately ordered from "obviously safe" to "edge-case carve-out" — the file's own comment notes the carve-outs are where an AST-walking rule regresses first.
