---
source: src/modules/example/title-rule.ts
source_sha256: 7c6085c751928e2875713720f0e1c846ce4454829ea5e77f8f0519802ddd99e5
context_sha256: 573c323e731a0534ad8ea16976e3af9df7578f01a92ef2ce81d18af6e1f3aee4
generated_at: 2026-11-22T05:15:40.684820+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/example/title-rule.ts

## Purpose
Defines a single shared validation rule for an example's title. It is written once so that both entry points that accept a title (the owner's own endpoint and the generic translator's endpoint) apply identical behavior.

## Key elements
- `trimmedExampleTitle` — the exported title schema. It is built by calling `trimmedInto` on the unwrapped `title` field of `UpdateExampleByIdBody` (the `PATCH` contract). Input is trimmed first, then checked against the contract's bounds. A whitespace-only title such as `"   "` fails as a field-level 422 and is not stored as a blank column.

## Relationships
- `src/infrastructure/http/schemas.ts` — provides the `trimmedInto` helper that wraps the contract's title schema with trimming.
- `src/modules/example/controllers/update-example.ts` and `src/modules/example/model.ts` are graph neighbors. Their use of this rule is not visible in this file. Going by the doc comment, they are likely the two "doors" that accept a title.

## Notes
- The rule derives from the `PATCH` contract's `title` field (`UpdateExampleByIdBody`, imported from `@api/schemas.zod`) rather than restating limits. Changing the contract changes this rule.
- The `.unwrap()` call implies the contract's `title` is optional or nullable. The rule applies to the inner type, so presence is not enforced here.
