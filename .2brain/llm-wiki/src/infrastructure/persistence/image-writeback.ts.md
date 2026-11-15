---
source: src/infrastructure/persistence/image-writeback.ts
sha256: a99296bd1880c028930ba6d2ea53dde35313a68f890c85f43b50e942e5bffdbd
generated_at: 2026-11-14T18:13:38.862059+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/persistence/image-writeback.ts

## Purpose

Provides a single, reusable writeback function that the image-digest pipeline calls to persist final `imageUrl` / `thumbnailUrl` back into a Mongoose document. It exists because the pipeline (`image.worker.ts`) lives below the domain layer and cannot import a model; each module hands the pipeline a writeback instance built over its own collection via this factory.

## Key elements

- **`imageWritebackFor<TDocument>(model)`** — Curried factory. Accepts a Mongoose `Model` and returns an `ImageWriteback` function `(documentId, key, urls) => Promise<boolean>`.
  - **Primary path:** `updateOne` matching `{ _id, pendingImageKey: key }`; `$set` the two URL fields, `$unset` `pendingImageKey`; `timestamps: false`.
  - **Fallback path:** If `matchedCount === 0`, runs `model.exists({ _id, imageUrl })` to detect whether a duplicate job delivery already wrote the same URLs (returns `true`) versus a genuine miss (returns `false`, signalling the caller should delete orphaned files).

## Relationships

- **`src/infrastructure/adapters/image.worker.ts`** — Supplies the `ImageWriteback` type that this file implements; the pipeline invokes the returned function to complete a digest job.
- **`src/infrastructure/persistence/create-repository.ts`** — Source of the `toObjectId` helper used to coerce the raw string `documentId` before the Mongoose query.
- **`src/modules/users/repository.ts`**, **`src/modules/products/repository.ts`**, **`src/modules/example/repository.ts`** — Each module's repository calls `imageWritebackFor(itsModel)` and passes the result to the image pipeline, binding the generic writeback to that module's specific collection.

## Notes

- The `pendingImageKey` equality guard makes the write idempotent and race-safe: a stale or duplicate job delivery silently no-ops rather than overwriting a newer upload.
- `timestamps: false` is deliberate — completing a digest is not a user edit and must not bump `updatedAt`.
- A `false` return means the document either doesn't exist or holds a *different* `imageUrl`; the caller is expected to clean up the now-orphaned image files.
- The module doc-block references `docs/tools/image-processing.md` for the broader pipeline design.
