---
source: scripts/audit/test-honesty/eslint.candidates.config.ts
sha256: a783dd0ca708e31bf415e0c5b27afa90121e374d5bcfc4aabdde54a0eef73fff
generated_at: 2026-11-14T17:21:48.158000+00:00
model: ollama:qwen3.8:27b
---

# scripts/audit/test-honesty/eslint.candidates.config.ts

## Purpose

Report-only ESLint configuration that flags every test whose assertions are **all** weak (e.g. `toBeDefined`, `toBeNull`, `toThrow` with no argument). It exists to surface low-value tests as a candidate list for human review, but it is explicitly **not** part of the lint gate because it produces roughly 113 hits for only about 6 real findings. It is invoked exclusively via `npm run audit:test-candidates`.

## Key elements

- **`WEAK_MATCHERS`** – Regex source string (`BeDefined|BeTruthy|BeInstanceOf|BeNull|BeUndefined|Throw`) naming the Jest matchers considered too permissive to count as a real assertion.
- **`WEAK_CALL`** – Derived esquery selector matching a `CallExpression` whose callee property is a weak `toXxx` matcher.
- **`STRONG_CALL`** – esquery selector matching a `CallExpression` whose callee property is any `toXxx` matcher *not* in the weak list.
- **`WEAK_ONLY_SELECTOR`** (exported) – Composed esquery selector: an `it`/`test` call that *has* at least one weak call and *lacks* any strong call. Reusable elsewhere if needed.
- **`candidatesConfig`** (default export) – `Linter.Config[]` array wiring the selector into ESLint's `no-restricted-syntax` rule at `warn` severity, scoped to `**/*.ts`, using `@typescript-eslint/parser`.

## Relationships

- **`tests/unit/scripts/audit/test-candidates.test.ts`** – Unit test that imports this config (or the `WEAK_ONLY_SELECTOR` export) to verify the selector matches the expected test shapes and does not match strong-assertion tests.

## Notes

- High false-positive rate is intentional and accepted: it is a *candidate* list, not a gate. Known false-positive sources noted in comments include asserting helpers (e.g. `refused(...)`) and Supertest's `.expect(200)`, neither of which registers as a "strong" `toXxx` call.
- The selector relies on `no-restricted-syntax`, which only supports esquery selectors (not full AST traversal), so detection is limited to syntactic shape.
- Because the rule severity is `warn` (not `error`), running this config standalone will never cause a CI failure even if the selector matches.
