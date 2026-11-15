---
source: src/infrastructure/persistence/translatable-columns.ts
sha256: a664318bd0c2e7606aeaa0e41be9578d798c5b496ac07a56bc8d71ff0f882a92
generated_at: 2026-11-14T18:15:02.674013+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/persistence/translatable-columns.ts

## Purpose

Provides the three database operations the `locales` translation port needs from an owning module's collection: look up a document's edit revision, copy fallback-locale field values onto the document's own columns, and stamp the document as edited. Each owning module (e.g. `products`, `example`) obtains its concrete implementation by calling the factory with its Mongoose model, rather than re-implementing the queries.

## Key elements

- **`TranslatableColumns`** (interface) — the contract the translation port sees: `revisionOf`, `writeDerived`, `markEdited`.
- **`translatableColumnsOf<TDocument>(model)`** (factory) — returns a `TranslatableColumns` implementation bound to the given Mongoose `Model`. The generic `TDocument` is only used for the `updateOne` type parameter.
- **`revisionOf(entityId)`** — `findOne` scoped to `_id` + the `EDIT_REVISION` projection; returns the stored counter or `undefined` if no row exists.
- **`writeDerived(entityId, fields, session?)`** — `updateOne` that sets non-null fields and `$unset`s nulls via `setAndUnset`/`clearedOrValue`; runs with `timestamps: false` so the copy is not recorded as an edit.
- **`markEdited(entityId, session?)`** — `updateOne` that `$set`s `updatedAt` (triggering the revision plugin's `$inc`), optionally fenced by `preconditionFilter`; throws `PreconditionFailedError` when the fence is present and `matchedCount` is 0.

## Relationships

- **`./changes`** — imports `clearedOrValue` and `setAndUnset` to build the `$set`/`$unset` payload in `writeDerived`.
- **`./create-repository`** — imports `toObjectId` for id parsing in all three methods.
- **`./revision-plugin`** — imports the `EDIT_REVISION` field name used in the `revisionOf` projection and the `markEdited` fence.
- **`./versioning`** — imports `PreconditionFailedError` and `preconditionFilter` for the `If-Match` guard in `markEdited`.
- **`src/modules/products/repository.ts`** and **`src/modules/example/repository.ts`** — consumers; each calls `translatableColumnsOf(TheirModel)` to satisfy the `locales` port's `TranslatableTarget` requirement.

## Notes

- `revisionOf` is `async` solely because `toObjectId` can throw synchronously on a malformed id; the query itself is the usual Mongoose `exec`.
- `markEdited` relies on the revision plugin intercepting the `updatedAt` `$set` to increment the counter — the write itself contains no explicit `$inc`.
- `timestamps: false` is deliberate in both `writeDerived` and `markEdited`: a derived field copy or a version bump must not also trigger Mongoose's automatic `updatedAt` path, which would double-increment the revision.
- The shape mirrors `reencryptOf(model)` in `../security/reencrypt.ts`: a pure function of the model producing a fixed interface, keeping the port decoupled from any specific collection.
