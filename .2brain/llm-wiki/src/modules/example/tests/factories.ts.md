---
source: src/modules/example/tests/factories.ts
sha256: 146e3d9a3314a0c778c159daaecebfcca7358cc5455fd1010b75b0deebc19e4a
generated_at: 2026-10-15T10:31:03.168364+00:00
model: ollama:qwen3.8:27b
---

# src/modules/example/tests/factories.ts

## Purpose

Test-scoped persistence helpers that wrap the domain factory and repository with a one-call "build + store" entry point, so test files never need to compose `makeExample` and `exampleRepository.create` themselves.

## Key elements

- **`createExample(overrides)`** – Builds an `ExampleDocument` via the shared `makeExample` factory, persists it through `exampleRepository.create`, and returns the stored document.
- **`fieldOf<TField>(id, field)`** – Reads a single field back from the database by id. Returns the typed value or `undefined` when the example or field is absent. Useful for asserting on one column without destructuring a full `findById` result.
- **Re-exports** – `makeExample` and the `ExampleOverrides` type are re-exported from `../factories` so test files can import both the in-memory builder and the persistence helper from this one module.

## Relationships

- **`src/modules/example/factories.ts`** – Upstream source of `makeExample` and `ExampleOverrides`; this file re-exports both and passes its result into the repository.
- **`src/modules/example/repository.ts`** – Provides `exampleRepository` used for the actual `create` and `findById` calls.
- **`src/modules/example/model.ts`** – Supplies the `ExampleDocument` type that constrains `fieldOf`'s generic and `createExample`'s return type.
- **Test consumers** (`api.contract.test.ts`, `capabilities.test.ts`, `service.test.ts`, `translations.test.ts`, `upload-claim.test.ts`, `role-hierarchy-rows.ts`) – Import `createExample` / `fieldOf` to seed and assert on database state during integration and contract tests.

## Notes

- This file is **test-only** (it lives under `tests/` and imports from the app layer). It must not be imported by production code.
- `fieldOf` intentionally swallows a missing example *or* a missing field, resolving to `undefined` in either case. Tests asserting a field is present should handle that ambiguity.
- The in-memory construction logic (defaults, timestamps, etc.) lives in `../factories.ts`; this file adds no transformation of its own.
