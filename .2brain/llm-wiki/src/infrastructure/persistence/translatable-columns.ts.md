---
source: src/infrastructure/persistence/translatable-columns.ts
sha256: 02f08f01327fd285e61f58ed21fc78b734ffe7d73376c0145904db5d89ae5f1e
generated_at: 2026-10-29T02:14:06.416175+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/persistence/translatable-columns.ts

## Purpose

Defines the `TranslatableColumns` interface and a `translatableColumnsOf(model)` factory that gives the `locales` translation port the three writes it needs on any owning module's Mongoose collection: check existence, copy fallback-locale fields onto the row's own columns, and stamp the document as edited. Both `products` and `example` build their port implementation from this single factory instead of repeating the logic.

## Key elements

- **`TranslatableColumns`** (interface) — the contract the translation port expects from a collection:
  - `exists(entityId)` — returns `true` if a document with that `_id` is present.
  - `writeDerived(entityId, fields, session?)` — `$set`s the given field map onto the document (nulls become `''`), used to materialize the fallback locale's values into searchable columns.
  - `markEdited(entityId, session?)` — sets `updatedAt` so the row's ETag/version advances even when no other column changed.
- **`translatableColumnsOf<TDocument>(model)`** (exported factory) — takes a Mongoose `Model` and returns a `TranslatableColumns` implementation. All three operations resolve the entity id via `toObjectId` before issuing a query.

## Relationships

- **`src/infrastructure/persistence/create-repository.ts`** — provides `toObjectId`, which this file uses to convert the string `entityId` into a valid ObjectId for every query.
- **`src/modules/products/repository.ts`** — calls `translatableColumnsOf(productsModel)` and passes the result to the `locales` port.
- **`src/modules/example/repository.ts`** — same pattern with its own model; both modules delegate to this factory rather than hand-writing the three operations.

## Notes

- `timestamps: false` is passed on every `updateOne`. `writeDerived` is a derived copy, not a user edit; `markEdited` writes `updatedAt` by hand because Mongoose's auto-timestamps only fire when at least one other `$set` key is present.
- The `as UpdateQuery<TDocument>` / `as QueryFilter<TDocument>` casts are required because column names arrive as runtime data (`Record<string, string | null>`), which a generic `TDocument` cannot express to the compiler.
- `exists` is `async` solely because `toObjectId` throws synchronously on a malformed id; the Mongoose call itself is awaited inside the expression.
- The shape deliberately mirrors `reencryptOf(model)` in `../security/reencrypt.ts` (a function-of-the-model factory) for consistency across infrastructure ports.
