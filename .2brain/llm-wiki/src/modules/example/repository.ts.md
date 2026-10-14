---
source: src/modules/example/repository.ts
sha256: 0983d2af2788dca640c17cdac125f2bf1bf3d492f7fda1a3c8bbd336aa149a24
generated_at: 2026-10-14T15:44:08.539114+00:00
model: ollama:qwen3.8:27b
---

# src/modules/example/repository.ts

## Purpose

The single access point to the `example` collection within the module. It layers module-specific operations (scoped reads, translation writeback, image-pipeline writeback, optimistic publish, hard-delete) on top of the shared CRUD/search factory. Only the module's services import it; nothing outside the module touches the collection directly.

## Key elements

- **`exampleRepository`** (sole export) — a const object that spreads `createRepository(exampleModel, …)` and adds the custom methods below. Typed explicitly as `Repository<ExampleDocument, ExampleRow> & { … }` to work around TS7056 with Mongoose generics.
- **`findScoped(id, scope)`** — `findOne` by id *and* an authorization scope in a single query, so visibility is enforced atomically with the read.
- **`deleteAllOf(userId, session)`** — deletes every row owned by `userId` inside the caller's transaction; returns the cover `imageUrl`s found before deletion so the caller can clean them up post-commit.
- **`existsById(id)`** — lightweight existence check (implements the `locales` port's `exists`).
- **`writeTranslatedFields(id, fields, session?)`** — copies fallback-locale text onto the document's own columns (`$set`, `null` → `''`). Uses `timestamps: false` so it doesn't masquerade as a user edit.
- **`markEdited(id, session?)`** — bumps `updatedAt` to advance the ETag/revision counter after a translation write.
- **`publishFrom(id, before, fields, session)`** — `findOneAndUpdate` guarded by `status: before`; only one concurrent publisher wins. Returns the post-update doc or `null`.
- **`writebackImage(documentId, key, urls)`** — image-pipeline callback. Matches on `pendingImageKey` for idempotency; on a miss, falls back to checking whether the target URL is already stored (handles duplicate job dispatch).
- **`searchable` config** (inside the factory call) — declares `objectIds`, `text`, and `sortable` keys. `status` is intentionally absent (closed enum, passed as a scope instead).

## Relationships

- **`src/modules/example/model.ts`** — supplies `exampleModel`, `applyExampleTransform`, and the `ExampleDocument` / `ExampleRow` types used throughout.
- **`src/infrastructure/persistence/create-repository.ts`** — provides the `createRepository` factory (CRUD + search), `toObjectId`, and the `Repository` base type.
- **`src/infrastructure/adapters/image.worker.ts`** — defines the `ImageWriteback` contract that `writebackImage` satisfies.
- **`src/modules/example/services/crud.ts`** — consumes the base CRUD, `findScoped`, and `publishFrom`.
- **`src/modules/example/services/cover.ts`** — drives the image pipeline via `writebackImage` and collects cover URLs from `deleteAllOf`.
- **`src/modules/example/services/personal-data.ts`** — calls `deleteAllOf` for user-data erasure.
- **`src/modules/example/module.ts`** — wires the repository into the service constructors at module registration time.
- **`src/modules/example/tests/integration/*.test.ts`** — integration tests exercise the repository through the service layer.
- **`src/modules/example/tests/factories.ts`** — test data factories for `ExampleDocument` / `ExampleRow`.

## Notes

- The explicit type annotation on `exampleRepository` exists because Mongoose's inferred generic is too large for TypeScript to serialize at an export boundary (TS7056). Do not remove it in favor of `as const` or inference.
- `timestamps: false` is deliberate on `writeTranslatedFields`, `markEdited`, and `writebackImage`: these are system-side writes and must not bump `updatedAt` as a user edit would (except `markEdited`, which sets it *by hand* to move the revision counter).
- `deleteAllOf` returns image URLs **before** the transaction commits; the caller is responsible for deferring file deletion until after commit to avoid orphaning files on rollback.
- `publishFrom` relies on the `status` filter in the query for optimistic concurrency — there is no `where` clause on a version column. If the status enum gains a new transitional value, the `before` parameter must still reflect what the caller last read.
- `writebackImage`'s idempotency fallback (`exists` check on `imageUrl`) means a stale duplicate job returns `true` (treated as "already held") rather than `false`, preventing the caller from deleting live files.
