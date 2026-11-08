---
source: tests/unit/scripts/eslint/friend-members.test.ts
sha256: b62ca4594a80b8abacd9d01b17589f5b602dbd0bc7739eef645f42495f6fc12c
generated_at: 2026-11-08T10:36:49.694944+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scripts/eslint/friend-members.test.ts

## Purpose

Unit test for the custom ESLint rule `friend-members`, which restricts cross-module access to guarded service members to their declared owner and friend modules. It exercises every acceptance path (owner, friend, unguarded name, different handle, non-module file) and every violation path (wrong module, chained call, destructuring, string-key access) through ESLint's `RuleTester`.

## Key elements

- **`tester`** — `RuleTester` instance configured with `@typescript-eslint/parser` and flat-config `languageOptions` (ESLint 9 style).
- **`options`** — The rule option payload: two service entries (`userService` owned by `users` with friend `account`; `orderService` owned by `orders` with friend `payments`) and their guarded member lists.
- **`tester.run('friend-members', …)`** — The single test suite.
  - **`valid`** (5 cases): friend calling a guarded member; owner calling its own member; accessing a name not in the guarded list; same member name on a non-guarded object; file outside `src/modules/`.
  - **`invalid`** (4 cases): non-friend module calling a guarded member; chained/line-broken member access; destructuring the member out of the handle; bracket-notation string key — all expecting `messageId: 'notAFriend'`.

## Relationships

- **`scripts/eslint/friend-members.ts`** — The rule under test. This file imports `friendMembers` and passes it to `RuleTester`; all valid/invalid expectations in this file must match the rule's reported `messageId` values.

## Notes

- The rule is cast `friendMembers as never` to satisfy `RuleTester`'s type signature (it expects the core ESLint rule shape, not the flat-config rule shape).
- Valid/invalid cases rely on the **file path** to determine module identity (`src/modules/<name>/…`); the rule is path-sensitive, so the `filename` option is load-bearing, not cosmetic.
- The `languageOptions` key (rather than the legacy `parser`/`parserOptions`/`env` keys) indicates this test targets the ESLint 9 flat-config API.
