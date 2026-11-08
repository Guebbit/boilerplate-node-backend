---
source: scripts/eslint/friend-members.ts
sha256: 3a6456a3c2e8c650f8dcf00d893be5265f3d749f6864574235c752eaf32cabc3
generated_at: 2026-11-08T02:50:44.515812+00:00
model: ollama:qwen3.8:27b
---

# scripts/eslint/friend-members.ts

## Purpose

A custom ESLint rule that enforces a "friend member" boundary on service handles: certain methods (the *friends-only* members) may be called only by the owning module and a declared list of friend modules. It exists because those methods carry no internal validation—the caller is expected to have already validated—so they must not be reachable from arbitrary modules. The rule reports a `notAFriend` diagnostic when an unlisted module invokes a guarded member.

## Key elements

- **`FriendEntry`** (interface) — one guarded handle: `handle` (local identifier), `owner` (owning module name), `members` (guarded method names), `friends` (allowed external callers).
- **`friendMembers`** (exported rule) — created via `ESLintUtils.RuleCreator.withoutDocs`. Options: `{ entries: FriendEntry[] }`. Single message ID `notAFriend`.
- **`moduleOf`** (local) — extracts the module segment from a path matching `src/modules/<name>/…`; returns `undefined` for files outside that tree.
- **`nameOf`** (local) — resolves a property key to a plain string (Identifier or string Literal); returns `undefined` for computed/expression keys.
- **`create`** visitor logic — checks two AST shapes:
  - `MemberExpression` — e.g. `userService.setPassword`
  - `VariableDeclarator` with an `ObjectPattern` id and an Identifier init — e.g. `const { setPassword } = userService`

## Relationships

- **`scripts/eslint/index.ts`** — barrel/index for the `scripts/eslint` directory; re-exports this rule (and siblings) so `eslint.config.ts` can import them in one place.
- **`tests/unit/scripts/eslint/friend-members.test.ts`** — unit tests that exercise the rule's detection of member-access and destructuring calls, owner/friend allowlisting, and the skip-when-outside-modules behaviour.

## Notes

- Files outside `src/modules/<name>/…` are skipped entirely (`create` returns `{}` when `moduleOf` is `undefined`).
- Computed property access (`obj[expr]`) is invisible to this rule; only static identifiers and string literals are matched.
- The rule is enabled and scoped in `eslint.config.ts`, where tests and factories are excluded from it.
- The design choice (rule vs. barrel export) is justified in `docs/theory/strategic-ddd.md#friend-members`.
