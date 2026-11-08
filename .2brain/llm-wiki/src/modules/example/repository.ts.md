---
source: src/modules/example/repository.ts
sha256: 7179e4fcb9c27501cc2126aa0732a3a6d3c8d114f53f12cd1779c96be33c25d8
generated_at: 2026-11-08T05:52:14.712715+00:00
model: ollama:qwen3.8:27b
---

# src/modules/example/repository.ts

## Purpose

The sole data-access layer for the "example" collection within the module. It composes the shared CRUD/search factory with the concerns this collection uniquely needs—scoped authorization reads, conditional status moves, bulk erasure with image cleanup, translation metadata, and image-writeback. The service layer is the public door; nothing outside the module imports this file directly.

## Key elements

- **`exampleRepository`** (export) — the repository object, typed as `Repository<ExampleDocument, ExampleRow>` plus four extra members. The type is written out explicitly (not inferred) because Mongoose's generics are too large for TypeScript to serialize at an export boundary (TS7056).
- **Base CRUD/search** (spread from `createRepository`) — standard `create`/`read`/`update`/`delete`/`search` with a row transform (`applyExampleTransform`) and a `searchable` map (objectIds, text, sortable). `status` is deliberately absent from free filters; it is a closed enum supplied as a scope by the service.
- **`findScoped(id, scope)`** — `findOne` by id *and* an authorization scope fragment in the same query, so an unauthorized row returns `null` rather than being read-then-rejected. `async` because `toObjectId` throws on malformed input.
- **`deleteAllOf(userId, session)`** — collects `imageUrl` values, deletes all rows for the user inside the caller's transaction, then returns the image URLs for the caller to remove post-commit.
- **`moveFrom(id, before, fields, session?)`** — optimistic-concurrency status transition: the write matches only rows still in `before`, so competing requests to the same document cannot both announce.
- **`translatable`** — the column map for i18n read/write, produced by `translatableColumnsOf`.
- **`writebackImage`** — the image-pipeline callback; idempotent because it matches on the pending key.

## Relationships

- **`src/modules/example/model.ts`** — provides `exampleModel`, `applyExampleTransform`, and the `ExampleDocument`/`ExampleRow` types used throughout.
- **`src/infrastructure/persistence/create-repository.ts`** — supplies the `createRepository` factory, `toObjectId` helper, and the base `Repository` type.
- **`src/infrastructure/persistence/conditional-status.ts`** — supplies `conditionalStatus`, the query-builder behind `moveFrom`.
- **`src/infrastructure/persistence/image-writeback.ts`** — supplies `imageWritebackFor`, wired into `writebackImage`.
- **`src/infrastructure/persistence/translatable-columns.ts`** — supplies `translatableColumnsOf` and the `TranslatableColumns` type.
- **`src/infrastructure/adapters/image.worker.ts`** — provides the `ImageWriteback` type for the writeback contract.
- **`src/modules/example/services/*`** (crud, transition, cover, personal-data) — the consuming service layer; the module's public API sits here, and this file is its internal implementation detail.
- **`src/modules/example/tests/integration/*`** and **`tests/factories.ts`** — integration tests exercise the repository through the services and test factories build documents against the same model.

## Notes

- **Explicit type annotation is load-bearing.** Removing the `Repository<…> & {…}` annotation and relying on inference triggers TS7056 at the export boundary; do not "simplify" it away.
- **`status` is a scope, not a filter.** The service passes it as part of the `scope` argument to `findScoped` or as the `before` parameter to `moveFrom`. Adding it to `searchable.text` or `searchable.objectIds` would break that contract.
- **Two-phase deletion.** `deleteAllOf` returns image URLs *after* the row delete succeeds but *before* the caller commits. The caller (e.g. `personal-data` service) is responsible for removing the images only after the transaction commits; doing it inside the repository would create a rollback gap.
- **All mutation methods accept `ClientSession`.** Callers are expected to pass their transaction session; omitting it silently breaks atomicity guarantees.
