---
source: src/infrastructure/persistence/image-writeback.ts
sha256: 08a7d4f183139e8f52e4f83d3b05c425a46a336040e26c74b9b3869476d49d1f
generated_at: 2026-11-08T03:42:56.279651+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/persistence/image-writeback.ts

## Purpose

Provides a per-collection writeback function for the image-digest pipeline. Because `image.worker.ts` sits below the module layer and cannot import a Mongoose model, each module calls this factory with its own model to produce a ready-to-use `ImageWriteback` callback. The callback persists the final `imageUrl` / `thumbnailUrl` onto the document once the pipeline finishes processing.

## Key elements

- **`imageWritebackFor<TDocument extends Document>(model): ImageWriteback`** — Generic factory. Returns a `(documentId, key, urls) => Promise<boolean>` function.
  - Performs a conditional `updateOne` guarded on `pendingImageKey === key`, sets `imageUrl` + `thumbnailUrl`, and unsets `pendingImageKey`.
  - Uses `timestamps: false` so the write does not bump `updatedAt`.
  - If `matchedCount === 0` (stale or duplicate job), falls back to a `model.exists` check: returns `true` if the document already holds the same `imageUrl` (twin job already wrote it), `false` otherwise.
- **`toObjectId`** (imported from `./create-repository`) — Converts the raw document-id string to a Mongoose `ObjectId` for the query filter.

## Relationships

- **`src/infrastructure/adapters/image.worker.ts`** — Source of the `ImageWriteback` type that this file implements. The worker calls the returned function to persist results; it cannot import a model itself.
- **`src/infrastructure/persistence/create-repository.ts`** — Supplies the `toObjectId` helper used in both the update and exists queries.
- **`src/modules/example/repository.ts`**, **`src/modules/products/repository.ts`**, **`src/modules/users/repository.ts`** — Each builds its own writeback via `imageWritebackFor(itsModel)` and passes the result into the image worker, keeping the worker model-agnostic.

## Notes

- The `as QueryFilter<TDocument>` casts are required because the generic `TDocument` does not structurally expose `pendingImageKey`, `imageUrl`, or `thumbnailUrl` to the compiler; the three fields are a convention shared by all image-bearing schemas.
- A `false` return is not necessarily a failure. It means the document was hard-deleted *or* the key no longer matches and the URL was not already held. The caller is expected to clean up live files in that case.
- `timestamps: false` is deliberate: a digest completing is not a user-initiated edit.
