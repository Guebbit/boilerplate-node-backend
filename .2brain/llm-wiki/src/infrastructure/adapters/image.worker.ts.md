---
source: src/infrastructure/adapters/image.worker.ts
sha256: a8630d0444620791a319a122cb981c196b0e922aee2c55c3e71cfd2860859df4
generated_at: 2026-10-01T12:48:54.996736+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/adapters/image.worker.ts

## Purpose

Implements the image-digest pipeline that turns a quarantined upload into a promoted original plus a thumbnail, then writes the resulting URLs back onto the target document. It provides both a queued worker entry point (`handleImageDigestJob`) and a shared pipeline function (`digestQuarantinedImage`) that the no-broker inline path in the upload middleware can reuse. Because this file sits below `@kernel`/`@modules` in the dependency hierarchy, the writeback is an inverted port registered at boot rather than a direct import.

## Key elements

- **`digestQuarantinedImage(key, owner)`** – The single pipeline: reads the quarantined file, identifies its MIME via magic bytes, re-encodes it and generates a thumbnail, promotes both under a content-derived stem, and returns `DigestedImageUrls`. Throws `UnsupportedImageFormatError` for permanent decode failures; any other error (storage I/O, disk full) propagates as a plain `Error` so the caller can distinguish retryable from non-retryable.
- **`handleImageDigestJob(job)`** – Queue worker entry point. Validates the payload, resolves the writeback for the job's `collection`, runs `digestQuarantinedImage`, then calls `settleWriteback`. Returns `false` (dead-letter) for malformed payloads, unregistered collections, or `UnsupportedImageFormatError`; rethrows transient errors so `consumeFromQueue` nacks and retries.
- **`enqueueImageDigest`** *(referenced in module docblock; implementation truncated)* – The no-broker inline fallback that shares `digestQuarantinedImage` and `settleWriteback` so both paths execute identical logic.
- **`ImageWriteback`** – Type alias: `(documentId, key, urls) => Promise<boolean>`. A module's writeback for one collection; returns `true` if the document matched and was updated (or a duplicate run already wrote the same values).
- **`registerImageWritebackResolver(resolver)`** – Boot-time setter (called from `app/workers.ts`) that installs the `collection → ImageWriteback` lookup. Until called, `resolveWriteback` is `undefined`.
- **`UnsupportedImageFormatError`** – The sole permanent error class. Thrown when the MIME signature is unrecognised or the bytes cannot be decoded by sharp. Distinguishing it from other throws drives the retry-vs-discard decision.
- **`DigestedImageUrls`** – `{ imageUrl, thumbnailUrl }` pair ready for persistence.
- **`contentStem(owner, digested)`** – Derives the promoted file name: `${owner}-${sha256(digested).slice(0,24)}`. Owner-salting prevents two documents uploading byte-identical images from colliding on the same file.
- **`settleWriteback(...)`** (internal) – Calls the module writeback; on `false` deletes the promoted files (stale job / deleted document); on `true` invalidates the collection's cache tag. Removes the quarantine file in both cases.
- **`REENCODABLE_MIMES` / `isReencodableMime`** – Accepted MIME set (`png`, `jpeg`, `webp`) and a type-guard narrowing to `ReencodableImageMime`.
- **`IMAGE_QUEUE`** – Re-exported from `queue.ts` for the worker registry in `app/workers.ts`.

## Relationships

- **`src/app/workers.ts`** – Calls `registerImageWritebackResolver` at boot and registers `handleImageDigestJob` as the consumer for `IMAGE_QUEUE`.
- **`src/infrastructure/adapters/image-store.ts`** – Provides `imageStore` (quarantine read/write, promote, putDerivative, remove) used throughout the pipeline.
- **`src/infrastructure/adapters/image.ts`** – Supplies `digestImage`, `thumbnailImage`, and the `ReencodableImageMime` type.
- **`src/infrastructure/adapters/image-signatures.ts`** – Supplies `identifyImage` for MIME detection from raw bytes.
- **`src/infrastructure/adapters/queue.ts`** – Source of `IMAGE_QUEUE` and `publishToQueue` (used by the inline path to enqueue when a broker is available).
- **`src/infrastructure/adapters/cache.ts`** – `invalidateCacheTagsLogged` is called in `settleWriteback` after a successful writeback to clear the stale placeholder.
- **`src/infrastructure/adapters/logger.ts`** – Structured logging for warnings (malformed job, unregistered collection) and info (stale writeback cleanup).
- **`src/infrastructure/http/middlewares/upload.ts`** – Calls `digestQuarantinedImage` inline (no-broker path) before a document id exists, passing the quarantine key as `owner`.
- **`src/modules/products/services/image.ts` / `src/modules/products/repository.ts`** and **`src/modules/users/services/image.ts` / `src/modules/users/repository.ts`** – Provide the per-collection `ImageWriteback` implementations that `app/workers.ts` wires into the resolver.
- **`src/types/index.ts`** – Defines `ImageDigestJobPayload` consumed by `handleImageDigestJob`.
- **`tests/unit/infrastructure/adapters/image.worker.test.ts`** – Unit tests; start with `resolveWriteback` still `undefined` (pre-boot state).

## Notes

- **Inverted port, not import.** This module cannot import from `@kernel` or `@modules`. The writeback is injected via `registerImageWritebackResolver` at boot. Any code path that triggers a digest before that registration will hit the `unregistered collection` branch.
- **Permanent vs. transient error contract.** Only `UnsupportedImageFormatError` is permanent. Every other throw (storage write failure, disk full, DB error in the writeback) is treated as transient and retried. Do not add new permanent failure classes without updating the caller's catch logic.
- **Quarantine file lifecycle.** The quarantine file is deliberately left in place after `digestQuarantinedImage` returns. It is removed only inside `settleWriteback`, after the writeback has durably persisted the URLs. This ensures a retried job can re-read the original bytes.
- **Double cache invalidation is intentional.** The write that enqueues the digest job clears the collection tag *before* the digest runs, so the response re-warmed in the interim still carries placeholder URLs. `settleWriteback` issues a second invalidation once the real URLs are on the document; without it, cached responses serve placeholders for the full TTL.
- **`contentStem` owner semantics.** When a document id exists, it is the owner (retries of the same document converge on the same file). When no document exists yet (the `upload.ts` inline path), the quarantine key itself is the owner, making each upload unique—which is safe because that path never retries the same key.
- **`resolveWriteback` is module-level mutable state.** Tests that import this module start with it `undefined`; they must call `registerImageWritebackResolver` before exercising `handleImageDigestJob`.
