---
source: src/modules/example/tests/factories.ts
source_sha256: 7569d03012d9055a14f9f6b3774d1ee8a3e77f982d7c83325b35f3b14c2eafa8
context_sha256: 26a6694d59f6ddeb0451e53a2ab4fd001788edf38027166580961c48703338b0
generated_at: 2026-11-22T05:13:43.659355+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/example/tests/factories.ts

## Purpose
Test-only helpers that persist examples to the test database. The pure builder (`makeExample`) lives in `src/modules/example/factories.ts`, which the demo seed is also built from. This file only saves what that builder returns and offers a small read-back helper for assertions.

## Key elements
- `createExample(overrides)`: builds an example with `makeExample(overrides)` and stores it via `exampleRepository.create`. Returns `Promise<ExampleDocument>`. `overrides` is an `ExampleOverrides`, and its `userId` is documented as the owner.
- `fieldOf(id, field)`: loads the example with `exampleRepository.findById(id)` and returns one field of it. The result is typed as `ExampleDocument[TField] | undefined`. It resolves to `undefined` when the example or the field is absent.

## Relationships
- `src/modules/example/factories.ts`: provides `makeExample` and the `ExampleOverrides` type. This file wraps them with persistence.
- `src/modules/example/repository.ts`: exports `exampleRepository`, whose `create` and `findById` methods do the actual database access.
- `src/modules/example/model.ts`: supplies the `ExampleDocument` type used in the signatures.
- `src/modules/example/tests/contract/api.contract.test.ts`, `src/modules/example/tests/integration/capabilities.test.ts`, `src/modules/example/tests/integration/service.test.ts` and `src/modules/example/tests/integration/translations.test.ts` are graph neighbors, as are `src/modules/account/tests/contract/shop.contract.test.ts`, `tests/integration/erasure.test.ts` and `tests/integration/upload-claim.test.ts`. The graph links them to this file, so they are presumably its consumers. The file's content doesn't show how each one uses it.

## Notes
- Keep builder logic in `src/modules/example/factories.ts`. Only code that touches the database belongs here.
- `fieldOf` makes a fresh repository read on every call. Tests can use it to check stored state after a write, without a `findById(...)` and an `await` in the middle of an expression.
