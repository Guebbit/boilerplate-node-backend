---
source: src/modules/example/repository.ts
sha256: 7179e4fcb9c27501cc2126aa0732a3a6d3c8d114f53f12cd1779c96be33c25d8
generated_at: 2026-10-29T03:54:23.895036+00:00
model: ollama:qwen3.8:27b
---

# src/modules/example/repository.ts

## Purpose

The sole access point to the `example` collection within the module. It spreads the shared `createRepository` factory (plain CRUD + search) and layers on the operations this collection uniquely needs: scoped reads, transactional hard-delete, optimistic status transitions, translation, and image writeback. Services import this file; nothing outside the module does.

## Key elements

- **`exampleRepository`** (const, exported) — the single public export. Typed explicitly as `Repository<ExampleDocument, ExampleRow>` intersected with five extra members. The explicit type exists because Mongoose's generics are too large for TS to serialize an inferred type at an export boundary (TS7056).
  - **`findScoped(id, scope)`** — loads one document by id *and* an authorization scope in a single query; returns `null` if the scope doesn't match. `async` because `toObjectId` throws on malformed ids.
  - **`deleteAllOf(userId, session)`** — transactional hard-delete of all rows for a user; returns the list of `imageUrl` values (for post-commit image cleanup).
  - **`moveFrom(id, before, fields, session?)`** — conditional status write: the update only applies if the document's current `status` is still `before` (optimistic concurrency). Returns the saved doc or `null`.
  - **`translatable`** — `TranslatableColumns` object derived from `translatableColumnsOf(exampleModel)`, used by the translation pipeline.
  - **`writebackImage`** — `ImageWriteback` from `imageWritebackFor(exampleModel)`; matches on a pending key so stale/repeated jobs are no-ops.
- **`searchable` config** (passed to the factory) — declares `objectIds: { id: '_id' }`, free-text on `title`/`body`, and sortable on `createdAt`, `title`, `status`. `status` is deliberately *excluded* from free-text filters; it is a closed enum the service passes as a scope instead.

## Relationships

- **`src/infrastructure/persistence/create-repository.ts`** — provides the `createRepository` factory (CRUD + `search`) and the `Repository` / `toObjectId` utilities that this file spreads and extends.
- **`src/infrastructure/persistence/conditional-status.ts`** — exports `updateStatusIfIn`, consumed by `moveFrom` for the "only-if-status-is-still-`before`" guard.
- **`src/infrastructure/persistence/image-writeback.ts`** — exports `imageWritebackFor`; assigned to `writebackImage`.
- **`src/infrastructure/persistence/translatable-columns.ts`** — exports `translatableColumnsOf`; assigned to `translatable`.
- **`src/infrastructure/adapters/image.worker.ts`** — supplies the `ImageWriteback` type that `writebackImage` is typed against.
- **`src/modules/example/model.ts`** — source of `exampleModel`, `applyExampleTransform`, and the `ExampleDocument` / `ExampleRow` types used throughout.
- **`src/modules/example/services/crud.ts`**, **`transition.ts`**, **`personal-data.ts`**, **`cover.ts`** — the service layer that calls into this repository (the "door"); they never expose it to other modules.
- **`src/modules/example/tests/factories.ts`**, **`tests/integration/capabilities.test.ts`**, **`tests/integration/service.test.ts`** — test fixtures and integration tests that exercise the repository directly or through its services.

## Notes

- `searchable.status` is intentionally absent from free filters. If a service needs to filter by status, it passes it as a `scope` object to `findScoped` (or the factory's `search` scope parameter), not as a text/objectId filter.
- `deleteAllOf` returns image URLs *before* the delete runs (it queries first, then deletes). The caller is responsible for removing those images only after its transaction commits; the repository does not delete images itself.
- `moveFrom` is not a general-purpose update — it only writes `status` and `publishedAt`. For other field changes use the factory's `update`.
- Every write that takes a `ClientSession` must use the caller's session; passing `undefined` skips the transaction and breaks atomicity with sibling writes (e.g. outbox rows).
