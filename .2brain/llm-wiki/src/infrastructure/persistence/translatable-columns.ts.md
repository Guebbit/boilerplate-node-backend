---
source: src/infrastructure/persistence/translatable-columns.ts
sha256: 02f08f01327fd285e61f58ed21fc78b734ffe7d73376c0145904db5d89ae5f1e
generated_at: 2026-11-08T03:45:08.117647+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/persistence/translatable-columns.ts

## Purpose

Provides the three write operations the `locales` translation port requires from any owning module's collection—existence check, fallback-field copy, and edit-stamp—as a single factory built from a Mongoose model. Modules (`products`, `example`) call it once with their model rather than reimplementing the same three writes.

## Key elements

- **`TranslatableColumns`** (interface) — the contract the translation port asks of a collection:
  - `exists(entityId)` — resolves whether a document with that id is present.
  - `writeDerived(entityId, fields, session?)` — `$set`s the given column names to their values; `null` values become `''`.
  - `markEdited(entityId, session?)` — bumps `updatedAt` so the ETag advances even when no column changed.
- **`translatableColumnsOf<TDocument>(model)`** — factory that returns a `TranslatableColumns` implementation bound to the supplied Mongoose `Model<TDocument>`. Accepts an optional `ClientSession` on the two writes for transactional participation.

## Relationships

- **`src/infrastructure/persistence/create-repository.ts`** — this file imports `toObjectId` from it to convert string ids to `ObjectId` before every query.
- **`src/modules/products/repository.ts`** and **`src/modules/example/repository.ts`** — both are graph neighbors that are expected to call `translatableColumnsOf` with their respective models and hand the result to the `locales` port.

## Notes

- Both writes pass `timestamps: false` to Mongoose. For `writeDerived` this prevents Mongoose from bumping `updatedAt` on a derived copy; for `markEdited` it is required because Mongoose adds no `$set` to an otherwise-empty update, so the file hand-writes `{ $set: { updatedAt: new Date() } }`.
- `exists` is marked `async` (not just returning a promise) because `toObjectId` throws synchronously on malformed ids; the `await` surfaces that as a rejected promise.
- The `as UpdateQuery<TDocument>` cast in `writeDerived` is necessary because column names arrive as runtime data (`Record<string, string | null>`) that a generic `TDocument` cannot satisfy for the compiler.
- The pattern intentionally mirrors `reencryptOf(model)` in `../security/reencrypt.ts`: a pure function of the model that yields a fixed set of operations.
