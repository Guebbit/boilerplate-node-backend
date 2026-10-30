---
source: scripts/eslint/friend-members.ts
sha256: 3a6456a3c2e8c650f8dcf00d893be5265f3d749f6864574235c752eaf32cabc3
generated_at: 2026-10-29T01:37:14.867649+00:00
model: ollama:qwen3.8:27b
---

# scripts/eslint/friend-members.ts

## Purpose

A custom ESLint rule that enforces a C++-style "friend member" access model on service objects. Certain writes on a service handle (e.g. `userService.setPassword`) carry no internal validation because the designated caller has already validated; this rule ensures only the owning module and explicitly named friend modules may reach those members, flagging every other caller.

## Key elements

- **`FriendEntry`** (interface) — One guarded handle: `handle` (local object name), `owner` (owning module), `members` (friends-only member names), `friends` (additional allowed modules).
- **`moduleOf`** — Extracts the module name from a file path matching `src/modules/<name>/…`; returns `undefined` outside that layout.
- **`nameOf`** — Resolves a property key AST node to a plain string (Identifier or string Literal); returns `undefined` for computed keys.
- **`friendMembers`** (exported rule) — Created via `ESLintUtils.RuleCreator.withoutDocs`. Visits:
  - `MemberExpression` — catches `handle.member` access.
  - `VariableDeclarator` — catches `const { member } = handle` destructuring.
  - Reports a single `notAFriend` diagnostic when the caller module is neither owner nor friend.
- **`Options`** / **`MessageIds`** — Type aliases for the rule's option schema (`[{ entries: FriendEntry[] }]`) and its sole message ID.

## Relationships

- **`scripts/eslint/index.ts`** — Barrel/registry that imports and re-exports `friendMembers` so the ESLint config can reference it by name.
- **`tests/unit/scripts/eslint/friend-members.test.ts`** — Unit tests exercising the rule's visitor logic, option parsing, and report messages.

## Notes

- The rule is a no-op for files not under `src/modules/<name>/`; `create` returns an empty visitor object in that case.
- Computed property access (`obj[expr]`) is invisible to the rule — `nameOf` returns `undefined` and the check is skipped.
- Exclusion of test and factory files is handled externally in `eslint.config.ts`, not inside this rule.
- The rule uses `withoutDocs`, so there is no `docs.url` or `recommended` flag; wiring is purely config-driven.
- The diagnostic message text relies on backtick-delimited values for inline-code rendering in editors.
