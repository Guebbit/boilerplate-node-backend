---
source: src/infrastructure/adapters/image.worker.ts
sha256: 003ba678c50dae13bee4b922084367872d445100a44c0a29e2505323dc69a0ce
generated_at: 2026-10-14T07:45:01.755055+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/adapters/image.worker.ts

## Purpose

Implements the image-digest pipeline: reads a quarantined upload, identifies and re-encodes it, generates a thumbnail, promotes both files to the image store, and writes the resulting URLs back onto the target document. Exposes a shared core (`digestQuarantinedImage`) consumed by two entry points — the queued worker (`handleImageDigestJob`) and an inline no-broker path (`enqueueImageDigest`) — so both run one identical pipeline. Because this file sits below `@kernel`/`@modules` in the dependency graph, the writeback is an inverted port injected at boot.

## Key elements

- **`UnsupportedImageFormatError`** — the single *permanent* failure class. Thrown when bytes will never decode (bad signature, corrupt body, pixel-limit overflow). Distinguishes dead-letter-worthy failures from transient ones (storage I/O errors, DB writeback failures) that callers retry.
- **`DigestedImageUrls`** — interface holding `imageUrl` and `thumbnailUrl` returned by a finished digest.
- **`ImageWriteback`** — type alias for the inverted-port callback `(documentId, key, urls) => Promise<boolean>`. Returns `true` if the document was updated (or already had the URLs), `false` if no match (stale job / deleted doc).
- **`registerImageWritebackResolver(resolver)`** — boot-time injection (called from `app/workers.ts`) that installs a `collection → ImageWriteback` lookup. Until called, the internal resolver is `undefined`.
- **`contentStem(owner, digested)`** — (private) derives the shared file stem from `owner` + first 24 hex chars of SHA-256 over the re-encoded bytes. The owner salt prevents cross-document file collisions and protects unrelated live files during stale-run cleanup.
- **`digestQuarantinedImage(key, owner)`** — the core pipeline: read quarantine → `identifyImage` → `digestImage` → `thumbnailImage` → `imageStore.promote` + `imageStore.putDerivative` → return `DigestedImageUrls`. Leaves the quarantine file in place for retry.
- **`settleWriteback(…)`** — (private) calls the module writeback; on match, removes quarantine + invalidates cache tags; on no-match, removes quarantine + unlinks promoted files (orphan cleanup).
- **`handleImageDigestJob(job)`** — queue-consumer entry. Returns `false` for permanent failures (malformed payload, unregistered collection, `UnsupportedImageFormatError`); rethrows transient errors so `consumeFromQueue` nacks and retries.
- **`enqueueImageDigest`** — (referenced, truncated in source) the inline no-broker fallback that shares `digestQuarantinedImage` and `settleWriteback`.
- **`IMAGE_QUEUE`** — re-exported from `queue.ts` for the worker registry.

## Relationships

- **`src/app/workers.ts`** — calls `registerImageWritebackResolver` at boot (wiring module writebacks) and registers `handleImageDigestJob` as the queue consumer.
- **`src/infrastructure/adapters/image-store.ts`** — provides `readQuarantined`, `promote`, `putDerivative`, `removeQuarantined`, `remove`.
- **`src/infrastructure/adapters/image.ts`** — provides `digestImage`, `thumbnailImage`, and the `ReencodableImageMime` type.
- **`src/infrastructure/adapters/image-signatures.ts`** — provides `identifyImage` (magic-byte detection on raw bytes).
- **`src/infrastructure/adapters/queue.ts`** — source of `IMAGE_QUEUE` and `publishToQueue` (used by the inline path to enqueue when a broker is available).
- **`src/infrastructure/adapters/cache.ts`** — `invalidateCacheTagsLogged` is called in `settleWriteback` after a successful writeback to clear the collection's cache tag a second time.
- **`src/infrastructure/adapters/logger.ts`** — structured logging for warnings and info messages.
- **`src/infrastructure/http/middlewares/upload.ts`** — caller of `digestQuarantinedImage` in the synchronous no-broker path (passes the quarantine key as `owner` since no document ID exists yet).
- **Module repositories/services** (`src/modules/{products,users,example}/…`) — supply the `ImageWriteback` implementations that are resolved at runtime via the registered resolver; they do not import this file directly.

## Notes

- **Dependency inversion is structural, not incidental.** This file cannot import from `@kernel` or `@modules`; the `ImageWriteback` type is declared here (structurally identical to `kernel/registry.ts`'s `ImageTarget`) and resolved via injection. Any new module must register its writeback through `app/workers.ts`.
- **`resolveWriteback` is `undefined` until boot.** A job that arrives before `registerImageWritebackResolver` runs will hit the unregistered-collection branch and be dead-lettered. Tests that import this module start in that state.
- **Quarantine file lifecycle.** The quarantine file is deliberately *not* removed inside `digestQuarantinedImage`. It is removed only in `settleWriteback` after the writeback resolves. A failed writeback must still be able to re-read the file on retry.
- **Permanent vs. transient error contract.** Only `UnsupportedImageFormatError` signals "stop retrying." Any other thrown `Error` (storage I/O, DB, etc.) is expected to be caught by the queue consumer and retried. Callers should not catch `UnsupportedImageFormatError` as a subclass of a transient type.
- **`Stryker disable` blocks** around `logger` calls indicate mutation-testing exclusions for log-only branches — these lines are intentionally untestable by mutation and should not be "cleaned up."
- **`owner` parameter is load-bearing.** Passing `undefined` or a constant for `owner` in `contentStem` would cause distinct documents to collide on the same file path, making stale-run cleanup able to delete another document's live image.
