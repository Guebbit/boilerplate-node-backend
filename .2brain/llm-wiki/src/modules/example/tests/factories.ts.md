---
source: src/modules/example/tests/factories.ts
sha256: 7569d03012d9055a14f9f6b3774d1ee8a3e77f982d7c83325b35f3b14c2eafa8
generated_at: 2026-10-29T03:57:10.145536+00:00
model: ollama:qwen3.8:27b
---

# src/modules/example/tests/factories.ts

## Purpose

Test-side persistence helpers for the `example` module. While `../factories.ts` builds in-memory example documents (the BUILDER), this file writes them to the test database and provides a small read-back utility so test assertions don't need to chain `findById` calls inline.

## Key elements

- **`createExample(overrides: ExampleOverrides)`** – Builds an example via `makeExample(overrides)` (imported from `../factories`) and persists it with `exampleRepository.create`. Returns the stored `ExampleDocument`.
- **`fieldOf<TField extends keyof ExampleDocument>(id, field)`** – Loads an example by id and returns a single stored field. Resolves to `undefined` if the example does not exist *or* if the field is not present on the document. Designed to be used directly in assertions without an intermediate `await`.

## Relationships

- **`src/modules/example/factories.ts`** — Source of `makeExample` and the `ExampleOverrides` type. That file contains the pure in-memory builder; this file delegates to it before persisting.
- **`src/modules/example/repository.ts`** — Provides `exampleRepository`, used here for both `create` (write) and `findById` (read-back in `fieldOf`).
- **`src/modules/example/model.ts`** — Provides the `ExampleDocument` type that both exports are typed against.
- **`src/modules/example/tests/contract/api.contract.test.ts`, `src/modules/example/tests/integration/capabilities.test.ts`, `src/modules/example/tests/integration/service.test.ts`, `src/modules/example/tests/integration/translations.test.ts`** — Test suites that consume `createExample` / `fieldOf` to set up and assert fixture data against the test database.

## Notes

- The file is explicitly *not* the builder. If you need to shape an in-memory example without persisting, reach for `makeExample` in `../factories.ts` instead.
- `fieldOf` silently returns `undefined` for a missing example **and** for a missing field (via `example?.[field]`), so a failed assertion will surface as an `undefined` value rather than a thrown error.
- The `overrides.userId` parameter on `createExample` controls ownership; pass whatever the test scenario requires.
