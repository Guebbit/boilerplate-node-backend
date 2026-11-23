---
source: src/infrastructure/persistence/image-writeback.ts
source_sha256: 7baefd96b3c0a9e123dd1786591da0b723de74172a13bbc987aad07346aec4ff
context_sha256: e173e1c0d8b873ca627245dac91b2586d516488ca60508c863037be6ff158ef7
generated_at: 2026-11-22T03:02:34.804485+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/persistence/image-writeback.ts

## Purpose
Provides the shared writeback step of the image digest pipeline for every collection that stores a picture. The pipeline (`image.worker.ts`) sits below the modules and cannot import a model, so each module passes it a writeback function built over its own model, e.g. `writebackImage: imageWritebackFor(userModel)`.

## Key elements
- `imageWritebackFor(model)`: takes a Mongoose `Model<TDocument>` and returns an `ImageWriteback` function `(documentId, key, urls) => Promise<boolean>`.
  - It runs an `updateOne` filtered on `_id` and `pendingImageKey: key`.
  - On a match it `$set`s `imageUrl` and `thumbnailUrl` from `urls` and `$unset`s `pendingImageKey`.
  - It passes `timestamps: false`, so Mongoose's automatic timestamp update is skipped (the digest finishing is not an edit anybody made).
  - It resolves `true` if the update matched a document.
  - If nothing matched, it checks whether a document with that `_id` already has `imageUrl` equal to `urls.imageUrl`. It resolves `true` if so and `false` otherwise.

## Relationships
- `image.worker.ts`: defines the `ImageWriteback` type that this file returns. The worker calls the resulting function once the digest has produced URLs.
- `create-repository.ts`: provides `toObjectId`, which converts the string `documentId` to an ObjectId for both queries.
- `example`, `products` and `users` `repository.ts`: each builds a writeback from its own model with `imageWritebackFor` and hands it to the pipeline.

## Notes
- The `pendingImageKey` condition means a stale or duplicate job delivery cannot overwrite a later upload. It also means a hard-deleted document shows up as a detectable miss (`false`) rather than a write to nothing.
- A miss does not always mean failure. A duplicate run of the same job may already have written these exact URLs, which the fallback `exists` check on `imageUrl` counts as held (`true`). Without that, the caller would delete the live files.
- The target model's documents must carry `pendingImageKey`, `imageUrl` and `thumbnailUrl`. Nothing in the types enforces this.
