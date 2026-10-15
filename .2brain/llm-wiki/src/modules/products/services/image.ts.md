---
source: src/modules/products/services/image.ts
sha256: 682490077108dc6b4a7686ee0b5c3690126a1e8ed26bd6737f25109a8e39fcff
generated_at: 2026-10-15T11:44:16.354837+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/services/image.ts

## Purpose

Single-responsibility hand-off point that enqueues the image-digest job for a product immediately after it has been persisted. It exists so the CRUD layer can trigger the async image-processing step without knowing the queue adapter or writeback mechanics.

## Key elements

- **`enqueueIfPending(product: ProductDocument): Promise<ProductDocument>`** — The sole export. Delegates to `enqueueIfImagePending`, passing the product, the queue name `'products'`, and `productRepository.writebackImage` as the writeback callback. Returns the (potentially updated) `ProductDocument` once the enqueue/writeback step resolves.

## Relationships

- **`src/infrastructure/adapters/image.worker.ts`** — Provides `enqueueIfImagePending`, the adapter-level function that decides whether the queue is ready, dispatches the job, and invokes the writeback. This file is a thin domain-level wrapper around that call.
- **`src/modules/products/repository.ts`** — Supplies `productRepository.writebackImage`, the callback the worker calls to persist the resolved image key back onto the document after digestion.
- **`src/modules/products/model.ts`** — Source of the `ProductDocument` type used as the function's parameter and return type.
- **`src/modules/products/services/crud.ts`** — The caller: after a product is created or updated (and `pendingImageKey` is set), it invokes `enqueueIfPending` to kick off the digest pipeline.

## Notes

- `pendingImageKey` on the document does **not** mean the image is fully processed; it means the upload queue was ready at upload time. On the no-broker path the key is resolved inline *before* the save (see `readUploadedImage` in the worker adapter), so the document may already carry a final key and the enqueue is a no-op.
- The queue name is hard-coded to `'products'` here. If a different domain ever needs the same pattern, it would pass its own name to `enqueueIfImagePending` directly rather than re-exporting from this file.
- The file is intentionally one function. There is no state, no branching, and no side-effects beyond the delegated call—keep it that way.
