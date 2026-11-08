---
source: src/infrastructure/adapters/image.worker.ts
sha256: 7efa5256e8a8bb032acf52c998a77bde54a18ad001a0952037cfa6550ee8a375
generated_at: 2026-11-08T03:20:18.140523+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/adapters/image.worker.ts

## Purpose

Implements the single image-digest pipeline: it reads a quarantined upload, identifies and re-encodes it (original + thumbnail), promotes both to storage under a content-addressed, owner-salted stem, and writes the resulting URLs back onto the target document. It exists as a dedicated adapter so that both the queued worker path and the inline (no-broker) fallback share one code path, and so that the infrastructure layer can perform the writeback without importing `@kernel` or `@modules` (inverted port).

## Key elements

- **`digestQuarantinedImage(key, owner)`** — The one pipeline. Reads the quarantine bytes, identifies the MIME, re-encodes (digest → thumbnail), promotes both under a shared `contentStem`, and returns `DigestedImageUrls`. Leaves the quarantine file in place for retry. Throws `UnsupportedImageFormatError` (permanent) on undecodable bytes; plain `Error` (transient) on storage failures.
- **`handleImageDigestJob(job)`** — Queue-consumer entry point. Validates the payload, resolves the writeback, runs the pipeline, settles the writeback, and returns `false` for permanent failures (dead-letter) or rethrows for transient ones (retry via nack).
- **`registerImageWritebackResolver(resolver)`** — Boot-time hook called by `app/workers.ts` to install the collection→writeback lookup. Until called, all writeback lookups return `undefined`.
- **`ImageWriteback` (type)** — The inverted port: `(documentId, key, urls) => Promise<boolean>`. Structurally identical to the kernel's `ImageTarget` to avoid a cross-layer import.
- **`DigestedImageUrls` (interface)** — `{ imageUrl, thumbnailUrl }` returned by a completed digest.
- **`UnsupportedImageFormatError`** — The sole permanent-failure class; the queue consumer distinguishes it from transient errors to decide dead-letter vs. retry.
- **`IMAGE_QUEUE` (re-export)** — Re-exported from `queue.ts` for the worker registry in `app/workers.ts`.
- **`contentStem(owner, digested)`** (internal) — Builds the promoted file stem: `owner` + first 24 hex chars of SHA-256 over the re-encoded bytes. Prevents cross-owner collision and enables idempotent convergence on retry.
- **`settleWriteback`** (internal) — Calls the module writeback; on match → removes quarantine + invalidates cache; on no-match → removes quarantine + deletes the promoted files (orphan cleanup).
- **`REENCODABLE_MIMES` / `isReencodableMime`** (internal) — Derived from `images.generated.ts` format table; gates which MIME types enter the digest pipeline.

## Relationships

- **`app/workers.ts`** — Calls `registerImageWritebackResolver` at boot and registers `handleImageDigestJob` with the queue consumer under `IMAGE_QUEUE`.
- **`image-store.ts`** — Source of all storage I/O: `readQuarantined`, `promote`, `putDerivative`, `removeQuarantined`, `remove`.
- **`image.ts`** — Provides `digestImage` and `thumbnailImage` (Sharp-based re-encoding) and the `ReencodableImageMime` type.
- **`image-signatures.ts`** — Provides `identifyImage` to sniff the actual MIME from raw bytes before re-encoding.
- **`queue.ts`** — `publishToQueue` is used by the inline `enqueueImageDigest` path to publish a job; `IMAGE_QUEUE` is the shared queue name.
- **`cache.ts`** — `invalidateCacheTagsLogged([collection])` is called after a successful writeback to make the new URLs visible to cached responses.
- **`logger.ts`** — Structured logging for the "writeback matched no document" cleanup path.
- **`http/middlewares/upload.ts`** — The synchronous, pre-document inline caller of `digestQuarantinedImage` (and the inline enqueue path) using the quarantine key as `owner` since no document id exists yet.
- **`persistence/image-writeback.ts`** — The concrete `ImageTarget` implementations live in module repositories; the resolver installed at boot maps job `collection` fields to them. This file's `ImageWriteback` type mirrors that signature.
- **Module repositories / services** (`products`, `users`, `example`) — Their writeback functions are the concrete implementations resolved at runtime via the registered resolver; their services publish digest jobs or call the inline path.

## Notes

- **Permanent vs. transient errors is load-bearing.** `UnsupportedImageFormatError` (bad signature, undecodable bytes, decode failure) is permanently dead-lettered. Any other throw (disk full, storage write error, writeback DB failure) is retried by the queue. Do not wrap transient errors in the permanent class.
- **Quarantine file is not deleted inside the pipeline.** The caller deletes it only after a *successful* writeback, so a retry can re-read the bytes. A failed writeback's promoted files are unlinked instead.
- **`owner` parameter matters.** Pass the target document's id when one exists (queued path, inline-with-document); pass the quarantine key itself when no document exists yet (`upload.ts` pre-write path). Mixing these up breaks idempotency or causes cross-owner file collisions.
- **Cache invalidation happens twice.** The write that enqueued the job clears the collection tag before the digest runs (so the placeholder response is cached); this file clears it a second time after the writeback succeeds. Removing either invalidation leaves a stale placeholder for the tag TTL.
- **`resolveWriteback` is `undefined` until boot.** Any job arriving before `registerImageWritebackResolver` runs (or in tests that skip boot) will be treated as an unregistered collection and dead-lettered.
- **`enqueueImageDigest`** (referenced in the module docblock and the `settleWriteback` docblock) is the no-broker inline path that either publishes to the queue or runs the pipeline synchronously; its implementation follows the truncated portion of this file.
