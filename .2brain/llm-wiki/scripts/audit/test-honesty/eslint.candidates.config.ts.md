---
source: scripts/audit/test-honesty/eslint.candidates.config.ts
source_sha256: 4ed1c4caee61e1e84f4ca81d67192a07d0080b97b5a9ddd347d22ac40509c0f2
context_sha256: 7013c6b3ec3eb76cc009144b86a1ef1205fd6f6cb869e05f6106017be2bdabbc
generated_at: 2026-11-22T01:52:23.240399+00:00
model: claude-code:claude-sonnet-5-5
---

# scripts/audit/test-honesty/eslint.candidates.config.ts

## Purpose
A report-only ESLint flat config for the `test-honesty` audit. It lists every `it(...)`/`test(...)` whose assertions are all weak (e.g. only `toBeDefined`). It is not part of the lint gate, because it yields about 113 hits for about 6 real findings. It is run only by `npm run audit:test-candidates`.

## Key elements
- `WEAK_MATCHERS` (internal): pipe-separated list of weak matcher name suffixes: `BeDefined|BeTruthy|BeInstanceOf|BeNull|BeUndefined|Throw`.
- `WEAK_CALL` (internal): esquery selector for a `toXxx` matcher call from the weak list.
- `STRONG_CALL` (internal): esquery selector for a `toXxx` matcher call that is not in the weak list, i.e. a real assertion.
- `WEAK_ONLY_SELECTOR` (exported): selects an `it`/`test` call that contains at least one weak matcher call and no strong matcher call.
- default export `candidatesConfig` (`Linter.Config[]`): applies to `**/*.ts` files, uses the `@typescript-eslint/parser`, and enables `no-restricted-syntax` at `warn` with `WEAK_ONLY_SELECTOR` and the message "every assertion in this test is weak".

## Relationships
- `tests/unit/scripts/audit/test-candidates.test.ts` is the associated unit test for this audit config. It most likely exercises the exported `WEAK_ONLY_SELECTOR` or the config.

## Notes
- Known false positives, acceptable for a candidate list: an asserting helper (such as `refused(...)`) and supertest's `.expect(200)` are not counted as strong assertions.
- The only rule enabled is `no-restricted-syntax`, so results are warnings, not errors.
