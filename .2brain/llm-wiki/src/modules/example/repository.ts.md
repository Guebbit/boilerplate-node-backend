---
source: src/modules/example/repository.ts
source_sha256: 79cba2bd4e7b2adc139c8e81a462f1fccd70edd500b11fb9596487c50b291d22
context_sha256: 6909b149c1c46b7666cbf509bac8bda93c93e42b54fe3bb2082f42237b851108
generated_at: 2026-11-22T05:10:51.099721+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/example/repository.ts

## Purpose
The single access point to the example collection. It builds a repository from the shared `createRepository` factory (CRUD and search) and adds the operations only this collection needs: scoped reads, user-wide deletion, conditional status moves, translatable-column metadata and image writeback. Per the file's own doc comment, nothing outside the module imports it; the service layer is the only caller.

## Key elements
- `exampleRepository` — the sole export. It is explicitly typed as `Repository<ExampleDocument, ExampleRow>` plus extras, because an inferred type is too large for TypeScript to serialize at an export boundary (TS7056).
- Factory base — `createRepository(exampleModel, …)` with `transform: applyExampleTransform`. Its `searchable` config defines:
  - `objectIds`: `id` maps to `_id`.
  - `text`: `title` and `body`.
  - `sortable`: `createdAt`, `title` and `status`.
  - `status` is deliberately not a free filter. It is a closed enum, so the service passes it as a scope.
- `findScoped(id, scope)` — a `findOne` on `_id` merged with the authorization scope in the same query, so visibility is never checked after the read. It is `async` because `toObjectId` throws on a malformed id.
- `deleteAllOf(userId, session)` — inside the caller's transaction, it finds the user's rows that have an `imageUrl`, then `deleteMany`s all of the user's rows. It returns the cover image URLs so the caller can remove them after commit.
- `moveFrom(id, before, fields, session?)` — a status change via `updateStatusIfIn`, applied only while the document still has the `before` status. It sets `status` and `publishedAt`, and returns the saved document, or `null` if a peer moved it first.
- `translatable` — from `translatableColumnsOf(exampleModel)`.
- `writebackImage` — from `imageWritebackFor(exampleModel)`. It is the image pipeline's writeback and matches on the pending key, so stale or repeated jobs change nothing.

## Relationships
- `src/modules/example/model.ts` supplies `exampleModel`, `applyExampleTransform` and the `ExampleDocument`/`ExampleRow` types.
- `src/infrastructure/persistence/create-repository.ts` supplies the base CRUD/search, `toObjectId` and the `Repository` type.
- `src/infrastructure/persistence/conditional-status.ts` backs `moveFrom`.
- `src/infrastructure/persistence/image-writeback.ts` backs `writebackImage`, whose `ImageWriteback` type comes from `src/infrastructure/adapters/image.worker.ts`.
- `src/infrastructure/persistence/translatable-columns.ts` backs `translatable`.
- The service files (`src/modules/example/services/cover.ts`, `crud.ts`, `personal-data.ts`, `transition.ts`) and `module.ts` sit in the same module and are the intended consumers. The file does not show which service calls which method.
- The factories and integration tests (`capabilities.test.ts`, `service.test.ts`) are neighbors in the graph. The file itself shows no interaction with them.

## Notes
- Every write in `deleteAllOf` must take the passed `session`. The caller removes the returned image files only after the transaction commits.
- `moveFrom` is a compare-and-set on status. It prevents two concurrent requests from both announcing the same transition.
- The doc comment above `translatable` describes the image writeback, so the comments sit slightly out of step with the members they precede.
