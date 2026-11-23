---
source: src/infrastructure/persistence/translatable-columns.ts
source_sha256: 76bb84a322b4d845cc9af8cbbcdad6367534ea2baa9b68ea26fd32a7f8a25633
context_sha256: a4f1c35b041212810f608ee625e607f8a5639184134dd72ec216117cf7c9c6b3
generated_at: 2026-11-22T03:04:58.892320+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/persistence/translatable-columns.ts

## Purpose
Builds, from a Mongoose model, the three writes the `locales` translation port needs from an owning module: check an entity exists (via its edit counter), copy the fallback locale's fields onto the entity's own columns, and stamp the entity as edited. It lets modules such as `products` and `example` derive these from their model instead of hand-writing them.

## Key elements
- `TranslatableColumns` (interface): the shape the translation port (`TranslatableTarget`) asks for.
  - `revisionOf(entityId)`: returns the document's edit counter (`0` before its first edit), or `undefined` if no document has that id.
  - `writeDerived(entityId, fields, session?)`: copies fallback-locale fields onto the document's columns. A `null` value becomes an `$unset`. Uses `timestamps: false`, since a derived copy is not a user edit.
  - `markEdited(entityId, session?)`: sets `updatedAt` so the document's version (ETag) moves even if no column changed. Uses `timestamps: false`. Throws `PreconditionFailedError` when an open `If-Match` precondition no longer matches.
- `translatableColumnsOf(model)`: factory returning a `TranslatableColumns` for the given model.

## Relationships
- `changes.ts`: `setAndUnset` and `clearedOrValue` build the `$set`/`$unset` update in `writeDerived`.
- `create-repository.ts`: `toObjectId` converts the string id to an `ObjectId` in all three writes.
- `revision-plugin.ts`: `EDIT_REVISION` names the counter field read by `revisionOf` and used in the fence. The plugin sees the `updatedAt` stamp in `markEdited` and adds the `$inc` of the counter.
- `versioning.ts`: `preconditionFilter` builds the `If-Match` fence for `markEdited`; `PreconditionFailedError` is thrown when the fence is non-empty and nothing matched.
- `src/modules/example/repository.ts` and `src/modules/products/repository.ts`: the modules whose translation port writes are built with this factory.

## Notes
- `revisionOf` is `async` so a malformed id (which makes `toObjectId` throw) surfaces as a rejected promise.
- `markEdited` writes `updatedAt` by hand because Mongoose adds no `$set` to an empty update when `timestamps: false`.
- `session` joins the caller's transaction; when `undefined`, the write runs standalone.
- `markEdited` only throws when the fence is non-empty, so with no precondition open a zero match is silent.
- The `as UpdateQuery<TDocument>` cast in `writeDerived` exists because column names arrive as data, which a generic `TDocument` cannot show the compiler.
- It follows the same "function of the model" shape as `reencryptOf(model)` in `scripts/ops/reencrypt.ts`.
