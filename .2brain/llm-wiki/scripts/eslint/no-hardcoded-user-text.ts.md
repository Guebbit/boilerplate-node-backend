---
source: scripts/eslint/no-hardcoded-user-text.ts
sha256: 6e6c2d2fb2318599e8179459d3939c1b1c0d91f3d88067b4f5eff662ab4be42d
generated_at: 2026-09-23T17:27:17.854212+00:00
model: ollama:qwen3.8:27b
---

# scripts/eslint/no-hardcoded-user-text.ts

## Purpose

Custom ESLint rule that enforces user-facing error copy must come from an i18n dictionary (`t(…)`) rather than a hardcoded string. It exists because `rejectResponse` and `generateReject` are the only code paths whose text reaches end-users, and passing a literal there bypasses translation.

## Key elements

- **`noHardcodedUserText`** (exported) — the rule itself, created via `ESLintUtils.RuleCreator.withoutDocs`. Takes no options; reports a single `literal` message.
- **`CARRIERS`** — a `Set` of the two function names (`rejectResponse`, `generateReject`) whose `errors` argument is inspected. All other call sites are ignored.
- **`isLiteralText`** — type-guard helper. Returns true for a `StringLiteral` or a `TemplateLiteral` with zero expressions (i.e., no interpolation). Template literals _with_ expressions pass through unflagged.
- **`create(context)` → `CallExpression` visitor** — the core logic. Locates the `errors` argument (must be an `ArrayExpression`), then walks each element:
    - Bare string/template literal element → report.
    - Object element → check each property; if the key is `message` (Identifier or Literal) and the value is literal text → report.
    - Properties named `code`, or any non-`message` key, are skipped.

## Relationships

- **`scripts/eslint/index.ts`** — the barrel file for the project's custom ESLint rules; imports and re-exports `noHardcodedUserText` so it can be enabled in the project's ESLint config.
- **`tests/unit/scripts/eslint/no-hardcoded-user-text.test.ts`** — unit tests that feed valid/invalid code samples through `noHardcodedUserText` via `RuleTester`, asserting which nodes are reported.

## Notes

- Only the `errors` argument is inspected; the `status` and `message` arguments of those functions are out of scope by design (the envelope `message` is derived internally by `resolveErrorMessage`).
- Technician-facing strings (`code:` values, log calls, audit actions, span names, `throw new Error(…)`) are intentionally **not** flagged. The rule is narrow by convention, not oversight.
- A template literal like `` `Error ${code}` `` is **not** flagged because it contains an expression — the rule treats interpolation as a signal the text is already dynamic/localised at the call site.
- The `message` key match handles both shorthand (`{ message: 'x' }`) and quoted (`{ 'message': 'x' }`) property keys.
