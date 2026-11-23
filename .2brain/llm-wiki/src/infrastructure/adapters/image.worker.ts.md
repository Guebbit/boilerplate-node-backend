---
source: src/infrastructure/adapters/image.worker.ts
source_sha256: f0f78e2b3826fea043b0adc77665543e3ea579cb792e25858b1bb84040c57618
context_sha256: e84170d46afa0b00097162011a352e76a6fc5d17cffa655afd5c1db1516e1465
generated_at: 2026-11-22T02:37:45.875711+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/adapters/image.worker.ts

## Purpose
Turns a quarantined upload into a promoted original plus thumbnail, then writes the resulting URLs back onto the waiting document. One pipeline, `digestQuarantinedImage`, is shared by the queued worker (`handleImageDigestJob`) and the no-broker inline path (`enqueueImageDigest`). Because this file sits below `@kernel`/`@modules`, it cannot import them, so the document writeback is an inverted port registered at boot.

## Key elements
- `IMAGE_QUEUE` — re-exported from `queue.ts` for the worker registry.
- `REENCODABLE_MIMES` / `isReencodableMime` — set of mimes built from `imageRuleData.formats` where `reencodable` is true. Used as a type guard narrowing to `ReencodableImageMime`.
- `UnsupportedImageFormatError` — the one permanent failure. Thrown when the signature doesn't match or the body can't be decoded.
- `QuarantineGoneError` — thrown only when reading the quarantined file hits `ENOENT`. The job handler acknowledges it rather than retrying.
- `contentStem(owner, digested)` — builds the shared file stem as `${owner}-${first 24 hex chars of sha256(digested)}`. Used for both the original and the thumbnail.
- `DigestedImageUrls` — `{ imageUrl, thumbnailUrl }`.
- `ImageWriteback` — type `(documentId, key, urls) => Promise<boolean>`. `true` means the document now holds the urls, including a duplicate run that already wrote them. `false` means nothing matched and the promoted files are deleted.
- `registerImageWritebackResolver(resolver)` — installs the `collection -> ImageWriteback | undefined` lookup. Until it is called, `resolveWriteback` is `undefined`.
- `digestQuarantinedImage(key, owner)` — pipeline: `imageStore.readQuarantined`, then `identifyImage`, then `digestImage`, then `thumbnailImage` on the digested bytes, then `imageStore.promote` and `imageStore.putDerivative` in parallel. Leaves the quarantine file in place.
- `settleWriteback(...)` — internal. Calls the writeback, then either cleans up (no match) or invalidates the collection's cache tag. It also calls `imageStore.removeQuarantined(key)` (best-effort) once the urls are written. Shared by the job handler and the inline fallback.
- `handleImageDigestJob` and `enqueueImageDigest` — referenced in the docs, but their definitions are beyond the visible portion of the file. `dispatchJob` and `invalidateCacheTagsLogged` are imported for them.

## Relationships
- `src/app/workers.ts` — supplies the writeback resolver at boot via `registerImageWritebackResolver`. It builds the resolver from `resolveImageTargets(enabledModules)`.
- `image-store.ts` — handles quarantine reads and removal, `promote`, and `putDerivative`. Its `promote` docblock explains the stem salting.
- `image.ts` — provides `digestImage`, `thumbnailImage`, and the `ReencodableImageMime` type.
- `image-signatures.ts` — `identifyImage` detects the format from the raw bytes.
- `queue.ts` — owns `IMAGE_QUEUE`.
- `job-dispatch.ts` — `dispatchJob`.
- `cache.ts` — `invalidateCacheTagsLogged`.
- `logger.ts` — `logger`.
- `src/infrastructure/http/middlewares/upload.ts` — calls the synchronous no-broker digest with `key` as the owner, before a document exists.
- Module repositories and services (`products`, `example`) — presumably the source of the writebacks and the enqueue callers. Their exact wiring is not visible in the shown portion.

## Notes
- **Error classification drives retry behavior.** Decode failures are wrapped as `UnsupportedImageFormatError` (permanent, because decoding is deterministic). Everything else is treated as transient and retried by `consumeFromQueue`.
- **The `owner` salt is deliberate.** Without it, two documents with byte-identical images would share one file, and cleaning up one stale run could delete the other's live image. Retries for the same document still converge on the same file.
- **A duplicate run must return `true` from the writeback.** Returning `false` deletes the files, which would take down the winner's live image.
- **The cache is invalidated a second time.** The enqueuing write already cleared the tag, so the re-warmed response may hold the placeholder. This is the only point where a finished digest becomes visible.
- The writeback type is kept structurally identical to `ImageTarget` in `src/kernel/registry.ts` on purpose.
