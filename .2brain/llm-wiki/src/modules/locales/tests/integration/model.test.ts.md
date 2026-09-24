---
source: src/modules/locales/tests/integration/model.test.ts
sha256: 2adfc8b3e0f91a88e09b8d6e25633683885bb1d46c0f1acd39830a17e48c6de6
generated_at: 2026-09-23T18:53:30.824193+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/tests/integration/model.test.ts

## Purpose

Integration tests that pin schema-level serialization guarantees for the `locale` and `localeEntry` Mongoose models. They exist because the OpenAPI schema declares `additionalProperties: false` on ~95 schemas, and the `.lean()` query path bypasses Mongoose's `toJSON` entirely — so serialization correctness must be asserted here rather than trusted to a single utility function.

## Key elements

- **`describe('language serialization')`** — Verifies that a hydrated locale document's `toJSON` output exposes `id` but never `_id` or `__v`; that the three caller-omittable fields (`direction`, `active`, `revision`) receive their schema defaults; and that `tag` is lowercased on write to prevent duplicate rows.
- **`describe('entry serialization')`** — Verifies the lean-list path (`localeService.searchEntries`) returns items with `id` (24-hex) and no `_id`/`__v`; and that omitting `value` on create yields `''` (satisfying the wire contract without requiring the caller to supply it).
- **`describe('baseLanguage')`** — Table-driven test confirming the schema `pre('validate')` hook derives `baseLanguage` from the tag's ISO 639-1 subtag across bare, regional, script, and combined forms; plus a guard that a caller-supplied `baseLanguage` is overwritten by the hook.

## Relationships

- **`src/modules/locales/repository.ts`** — Primary subject under test; `localeRepository.create` and `localeEntryRepository.create` are called directly to exercise schema hooks and defaults.
- **`src/modules/locales/services/index.ts`** — `localeService.searchEntries` is called to exercise the `.lean()` → transform → response path.
- **`src/modules/locales/factories.ts`** — `makeLocale` provides a pre-populated locale object for the `baseLanguage` test cases, reducing boilerplate.
- **`src/types/index.ts`** — `LocaleDirection` enum is imported to assert the `direction` default equals `ltr`.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` (called at module top-level) spins up the in-memory MongoDB instance the tests run against.
- **`tests/support/stub.ts`** — `asStub` is a type-level assertion helper used to narrow the `searchEntries` result before property checks.

## Notes

- The file deliberately does **not** test `applySerialization` in isolation; the doc comment explains this is because the lean path skips `toJSON` and the OpenAPI schema would reject leaked keys. The tests therefore assert the *output shape* on both paths independently.
- The `baseLanguage` override test casts through `Parameters<typeof localeRepository.create>[0]` to slip a field that no request schema accepts — the intent is to prove the hook wins regardless of what a developer writes in code.
- `setupTestDb()` is invoked at the top of the module (outside any `before` hook), relying on the test runner to execute it before the first `it`.
