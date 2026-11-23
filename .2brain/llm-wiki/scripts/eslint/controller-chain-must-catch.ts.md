---
source: scripts/eslint/controller-chain-must-catch.ts
source_sha256: e4d2d2c99b12b16e9c950274264c74972add97b1f716eb62dcee53a1b61609d4
context_sha256: 374891e5a2c6da5ee314aaa3ff97c193e60744f1ead2f21afd248453d42cfd60
generated_at: 2026-11-22T02:05:51.401946+00:00
model: claude-code:claude-sonnet-5-5
---

# scripts/eslint/controller-chain-must-catch.ts

## Purpose
A custom ESLint rule, `controllerChainMustCatch`, that requires a promise chain started in a controller to end in `.catch()`. The global handler in `app.ts` hides a missing `.catch()` by answering a client-shaped status, but it can't do cleanup (e.g. orphaned uploads) or record domain metrics. It can also misreport errors: a malformed `productId` on `POST /orders` came back as 500 instead of a bad request.

## Key elements
- `controllerChainMustCatch` (export): rule built with `ESLintUtils.RuleCreator.withoutDocs`. It has type `problem`, no options and a single message id, `missing`. On each `CallExpression` it builds a child-to-parent map from `context.sourceCode.getAncestors(node)`, then applies these checks in order:
  1. Skip if the call is the `object` of a parent `MemberExpression`. Only the outermost call of a chain is judged.
  2. Skip unless the chain's methods include `then` and do not include `catch`.
  3. Skip if `insidePromiseHandler`.
  4. Skip unless `insideExportedFunction`.
  5. Otherwise report `missing` on the call.
- `chainMethods`: collects method names of a call chain, from the outermost call inwards.
- `insidePromiseHandler`: true if the node sits inside a function expression or arrow function passed to `.then`, `.catch` or `.finally`. That inner chain rejects into the owning chain, so it is not reported.
- `insideExportedFunction`: finds the outermost enclosing function and checks that it is exported. It accepts a named or default export, or a `const` arrow or function expression held in an export. Only the exported handler is judged, because Express ignores a returned promise.
- Helpers: `isPromiseCallbackFunction`, `isEnclosingFunction`, `grandparentOf`, the `HANDLER_METHODS` set, and the `ParentOf` type.

## Relationships
- `scripts/eslint/index.ts`: a neighbor in the dependency graph. The rule is presumably registered there; the file's content doesn't show this.
- `tests/unit/scripts/eslint/controller-chain-must-catch.test.ts`: a neighbor in the dependency graph, presumably the unit test for this rule.

## Notes
- The rule does not rely on a typed `.parent` link, because TSESTree does not type one. Parents are rebuilt per visited call from `getAncestors`.
- Private helpers that return their chain are deliberately not flagged. The comments cite `post-reset-request.ts`, where the caller's `.catch` intentionally swallows the error so the response is identical for known and unknown emails.
- Chains inside `.then`, `.catch` or `.finally` callbacks are exempt. Reporting them would ask for a `.catch()` on something already covered, which teaches people to silence the rule.
- Only chains that contain `.then` are checked. A bare `.catch`-less call with no `.then` is not reported.
- The rule itself does not decide which files count as controllers. That scoping must come from elsewhere, such as the ESLint config.
