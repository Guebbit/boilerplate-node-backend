---
source: src/modules/example/tests/factories.ts
sha256: 7569d03012d9055a14f9f6b3774d1ee8a3e77f982d7c83325b35f3b14c2eafa8
generated_at: 2026-11-08T05:54:50.300282+00:00
model: ollama:qwen3.8:27b
---

# src/modules/example/tests/factories.ts

## Purpose

Test-database persistence layer for the `example` module. It sits one level below the pure builder (`src/modules/example/factories.ts`) and exists so tests can *store* and *selectively read back* example documents without hand-writing `repository` calls or destructuring `findById` results inline.

## Key elements

- **`createExample(overrides: ExampleOverrides): Promise<ExampleDocument>`** — Builds a document via `makeExample(overrides)` and persists it through `exampleRepository.create`. The `overrides` object carries the owning `userId` plus any case-specific fields.
- **`fieldOf<TField extends keyof ExampleDocument>(id, field): Promise<ExampleDocument[TField] | undefined>`** — Resolves a single stored field by id. Returns `undefined` if the example or the field is absent, letting tests assert on one value without a full `findById` destructuring step.

## Relationships

- **`src/modules/example/factories.ts`** — The builder this file wraps. `makeExample` produces the in-memory document; this file is the only place that pushes it into the test DB.
- **`src/modules/example/repository.ts`** — `exampleRepository.create` and `exampleRepository.findById` are the two calls this file delegates to.
- **`src/modules/example/model.ts`** — Supplies the `ExampleDocument` type that both exports reference.
- **`src/modules/example/tests/integration/*.test.ts`, `src/modules/example/tests/contract/api.contract.test.ts`, `src/modules/account/tests/contract/shop.contract.test.ts`, `tests/integration/erasure.test.ts`, `tests/integration/upload-claim.test.ts`** — Consumers that call `createExample` / `fieldOf` to set up and assert test data.

## Notes

- This file is **persistence-only**; the shape-construction logic lives in `../factories.ts`. Do not add field defaults here.
- `fieldOf` is intentionally generic so a test can write `await fieldOf(id, 'name')` and get a typed string (or `undefined`) back without casting.
- The `undefined` return from `fieldOf` means "absent" rather than throwing; tests must handle the missing-example case if they assert on a non-existent id.
