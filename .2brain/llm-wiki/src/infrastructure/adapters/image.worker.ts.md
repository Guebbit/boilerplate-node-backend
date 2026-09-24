---
source: src/infrastructure/adapters/image.worker.ts
sha256: a395e2a1a7194aab395d17678a33ddc1fd41c2c0b8118040c6d8d0623c3e91a6
generated_at: 2026-09-23T17:40:00.297144+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/adapters/image.worker.ts

## Purpose

Implements the single image-digest pipeline that turns a quarantined upload into a promoted original + thumbnail, then writes the resulting URLs back onto the target document. Serves both the queued worker path (`handleImageDigestJob`) and the no-broker inline path (`enqueueImageDigest`) so the two cannot drift apart. Because this file lives below `@kernel`/`@modules` in the dependency hierarchy, it cannot import module services directly; instead it receives a writeback function via an inverted port registered at boot.

## Key elements

- **`UnsupportedImageFormatError`** — the sole _permanent_ failure type. Thrown when bytes will never decode as PNG/JPEG/WebP. Callers dead-letter the job and remove the quarantine file.
- **`contentStem(owner, digested)`** _(internal)_ — derives the shared file identity (owner + first 24 hex chars of SHA-256 of re-encoded bytes). Owner salting prevents a stale-run cleanup from deleting a different owner's live file.
- **`DigestedImageUrls`** — interface: `{ imageUrl, thumbnailUrl }`, the two URLs a finished digest produces.
- **`ImageWriteback`** — type alias for the per-collection writeback function `(documentId, key, urls) => Promise<boolean>`. Structurally identical to `ImageTarget` in the kernel registry but declared here to avoid the upward import.
- **`registerImageWritebackResolver(resolver)`** — boot-time registration of the collection→writeback lookup. Called once from `app/workers.ts`.
- **`digestQuarantinedImage(key, owner)`** — the core pipeline: read quarantine → identify mime → re-encode original + thumbnail → promote both under `contentStem` → best-effort remove quarantine file. Returns `DigestedImageUrls`.
- **`settleWriteback(...)`** _(internal)_ — invokes the module writeback; on no-match (stale job / deleted doc) removes the promoted files; on match invalidates the collection's cache tag.
- **`handleImageDigestJob(job)`** — queue worker handler. Validates payload, resolves writeback, runs `digestQuarantinedImage` + `settleWriteback`. Returns `false` for permanent failures (malformed payload, unregistered collection, `UnsupportedImageFormatError`); rethrows transient errors for retry.
- **`enqueueImageDigest`** _(truncated in source)_ — queue-aware dispatch entry point called by module services; falls back to inline `digestQuarantinedImage` when the broker is disabled.
- **`IMAGE_QUEUE`** — re-exported from `queue.ts` for the worker registry in `app/workers.ts`.

## Relationships

- **`src/app/workers.ts`** — calls `registerImageWritebackResolver` at boot, wiring the collection→writeback map built from enabled modules.
- **`src/infrastructure/adapters/image-store.ts`** — provides `imageStore` (quarantine read/write, `promote`, `putDerivative`, `removeQuarantined`, `remove`).
- **`src/infrastructure/adapters/image.ts`** — provides `digestImage`, `thumbnailImage`, and the `ReencodableImageMime` type.
- **`src/infrastructure/adapters/image-signatures.ts`** — provides `identifyImage` to sniff the real mime from raw bytes.
- **`src/infrastructure/adapters/queue.ts`** — source of `IMAGE_QUEUE`, `isQueueEnabled`, `publishToQueue`; this file re-exports `IMAGE_QUEUE`.
- **`src/infrastructure/adapters/cache.ts`** — `invalidateCacheTagsLogged` called by `settleWriteback` after a successful writeback.
- **`src/infrastructure/adapters/logger.ts`** — structured logging throughout.
- **`src/infrastructure/http/middlewares/upload.ts`** — calls `enqueueImageDigest` inline (no-broker path) with the quarantine key as `owner` (no document id exists yet).
- **`src/modules/products/service.ts` / `src/modules/users/service.ts`** — call `enqueueImageDigest` after persisting an upload; their repositories supply the `ImageWriteback` implementation registered via `registerImageWritebackResolver`.
- **`src/types/index.ts`** — defines `ImageDigestJobPayload` used by the queue handler.
- **`tests/unit/infrastructure/adapters/image.worker.test.ts`** — unit tests for this module.

## Notes

- **Permanent vs. transient failure distinction is load-bearing.** `UnsupportedImageFormatError` → dead-letter + quarantine removal. Any other thrown error → rethrown for broker nack/retry, and the quarantine file is intentionally _left in place_ so the retry can re-read it. Do not broaden the `catch` in `handleImageDigestJob`.
- **Cache invalidation in `settleWriteback` is the only visibility point.** The write that enqueued the job already cleared the tag, but the response that re-warmed it still carries placeholder URLs. Without the second invalidation, a cached response serves stale placeholders for the tag's full TTL.
- **`resolveWriteback` is `undefined` until boot wiring completes.** Any test that imports this module without calling `registerImageWritebackResolver` will hit the "unregistered collection" branch.
- **Owner salting semantics differ by call site:** `handleImageDigestJob` passes `documentId`; `upload.ts`'s inline path passes the quarantine `key`. Retries of the same document converge on the same stem (idempotency); the upload path never retries the same key, so uniqueness is safe there.
- **Stryker mutation-testing annotations** (`// Stryker disable … all`) guard the log-only branches to prevent dead-code mutation.
