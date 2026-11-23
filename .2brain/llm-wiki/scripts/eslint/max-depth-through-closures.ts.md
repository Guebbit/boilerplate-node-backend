---
source: scripts/eslint/max-depth-through-closures.ts
source_sha256: f3cb5584b8071fe57dab5455678b9fbc15b1fb8b443c896fdb2ce0746671f7ec
context_sha256: 953e048476561e516d54065df1e18782d57dbeb8d435cbb32599bb265ee9cf29
generated_at: 2026-11-22T02:06:13.575986+00:00
model: claude-code:claude-sonnet-5-5
---

# scripts/eslint/max-depth-through-closures.ts

## Purpose
A custom ESLint rule, `maxDepthThroughClosures`, that limits block nesting while counting *through* callbacks. ESLint's built-in `max-depth` resets to zero inside every function, so a `.then` callback or an arrow passed to `.map` hides the depth a reader still carries. This rule keeps counting across those closures. Its definition is meant to match the PHP twin's `MaxNestingDepthRule` line for line.

## Key elements
- `maxDepthThroughClosures`: the exported rule, built with `ESLintUtils.RuleCreator.withoutDocs`. It is a `suggestion` with a single `tooDeep` message. It registers one `check` handler for every statement type in `LEVEL_OPENERS`.
- `RuleOptions`: the exported config type, `{ max?: number }`. The schema requires an integer `>= 0` and allows no other properties.
- `DEFAULT_MAX`: `3`. It is used when the rule is enabled without a number.
- `LEVEL_OPENERS`: the statement types that open a level. These are `if`, `for`, `for…in`, `for…of`, `while`, `do…while`, `switch` and `try`.
- `isElseIf`: true when an `if` is the `alternate` of another `if`. An `else if` continues a chain and opens no level of its own.
- `opensLevelFor(parent, child)`: decides whether `child` sits one level deeper than `parent`.
  - `if`: every child except the `test` counts.
  - Loops: only the `body` counts.
  - `switch`: every child except the `discriminant` counts.
  - `try`: always counts.
- `MEMBERS` and `restartsDepth`: nodes that reset the count to 0. These are function declarations, methods, class properties, static blocks, the TS abstract method and property definitions, and object-literal methods, getters and setters. Arrow functions and other function expressions carry the depth.
- `levelOf(node, reported)`: walks up the parents, starting at level 1, and adds a level for each parent that opens one. It returns the level when it reaches a restart point. It returns `undefined` if it passes a node that was already reported.
- `check` (inside `create`): skips `else if` nodes. For any other node whose level exceeds `max`, it records the node as reported and reports `tooDeep` with `{level, max}`.

## Relationships
- `scripts/eslint/index.ts` is the neighbor in the dependency graph. The rule is exported as a named, config-ready export, so that file is where it is expected to be registered or consumed.
- `tests/unit/scripts/eslint/max-depth-through-closures.test.ts` is the unit test for this rule.

## Notes
- Only the first block past the limit is reported. A `reported` set suppresses everything nested inside it.
- Conditions are read at the outer level. An `if` test, a loop header and a `switch` discriminant do not add depth.
- The default of 3 applies only when `max` is omitted from the options. `meta.defaultOptions` also sets `{ max: 3 }`.
- `max: 0` is valid, and it flags any level-opening statement at level 1.
- Because `restartsDepth` covers class members and object-literal methods but not arrows or function expressions, whether a callback counts depends on its syntactic form. A method shorthand in an object literal resets the count, while an arrow assigned to a property does not.
