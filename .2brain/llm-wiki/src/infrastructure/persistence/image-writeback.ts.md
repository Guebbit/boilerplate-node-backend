---
source: src/infrastructure/persistence/image-writeback.ts
sha256: 08a7d4f183139e8f52e4f83d3b05c425a46a336040e26c74b9b3869476d49d1f
generated_at: 2026-10-29T02:12:48.074488+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/persistence/image-writeback.ts

## Purpose

Provides a single reusable factory (`imageWritebackFor`) that binds a Mongoose model to the `ImageWriteback` contract expected by the image-digest pipeline. Because the pipeline lives in infrastructure and must not import module-level models, each module calls this factory with its own model to produce a writeback function the pipeline can invoke generically.

## Key elements

- **`imageWritebackFor<TDocument>(model)`** — Returns an `ImageWriteback` function `(documentId, key, urls) => boolean`. Performs a conditional `updateOne` (guarded by `pendingImageKey === key`) that sets `imageUrl`/`thumbnailUrl` and unsets `pendingImageKey`. On a zero-match it falls back to an `exists` check (same `imageUrl`) to distinguish "already written by a duplicate job" from a true miss.
- Imports **`ImageWriteback`** (type) from `image.worker.ts` and **`toObjectId`** from `create-repository.ts`.

## Relationships

- **`image.worker.ts`** — Defines the `ImageWriteback` type this file implements. The worker calls the function produced here; this file is its persistence-side counterpart.
- **`create-repository.ts`** — Supplies the `toObjectId` helper used to coerce the string `documentId` before querying.
- **`src/modules/users/repository.ts`**, **`src/modules/products/repository.ts`**, **`src/modules/example/repository.ts`** — Callers. Each passes its collection's Mongoose model to `imageWritebackFor` and hands the resulting function to the worker, keeping the worker model-agnostic.

## Notes

- The `as QueryFilter<TDocument>` casts are deliberate: the generic `TDocument` cannot express the three image-specific fields, so the filter/update objects are cast to satisfy the compiler.
- `timestamps: false` is intentional — a digest finishing is not a user edit and should not bump `updatedAt`.
- A zero-match on the conditional update is **not** always an error; it can mean a duplicate job delivery where the twin already wrote the same URLs. The subsequent `exists` check disambiguates the two cases.
- The factory pattern exists solely to keep the dependency direction clean (infrastructure → no model imports). Do not import a concrete model inside the worker.
