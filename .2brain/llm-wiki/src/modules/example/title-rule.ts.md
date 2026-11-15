---
source: src/modules/example/title-rule.ts
sha256: 7c6085c751928e2875713720f0e1c846ce4454829ea5e77f8f0519802ddd99e5
generated_at: 2026-11-14T20:02:44.118581+00:00
model: ollama:qwen3.8:27b
---

# src/modules/example/title-rule.ts

## Purpose
Defines the single shared validation rule for the Example entity's `title` field. It exists so that every HTTP entry point that accepts a title (the owner's own endpoint and the generic translator endpoint) applies identical trim-then-validate logic, preventing whitespace-only values from slipping through as blank column values.

## Key elements
- **`trimmedExampleTitle`** (exported const) — A Zod schema produced by wrapping the raw `title` field from `UpdateExampleByIdBody` with `trimmedInto`. It trims leading/trailing whitespace before validation, turning `"   "` into a field-level 422 rather than an empty string in the database.

## Relationships
- **`src/infrastructure/http/schemas.ts`** — Provides `trimmedInto`, the utility that composes the trim-then-validate pipeline. This file is the sole consumer of that helper in the example module.
- **`src/modules/example/controllers/update-example.ts`** — One of the two "doors" (the owner's own `PATCH` endpoint) that consumes `trimmedExampleTitle` when validating the request body.
- **`src/modules/example/model.ts`** — The target model whose `title` column this rule guards; the rule ensures the value arriving at the model is never a whitespace-only string.

## Notes
- The `unwrap()` call on the Zod schema strips the `z.ZodEffects` wrapper so `trimmedInto` can re-wrap it with the trim transform. Without this, the inner schema shape would not be accessible.
- The module doc comment states "written once for both doors" — if a third entry point is added, it should import this constant rather than re-deriving the rule inline.
