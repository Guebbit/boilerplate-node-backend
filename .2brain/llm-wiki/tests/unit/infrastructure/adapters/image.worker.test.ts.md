---
source: tests/unit/infrastructure/adapters/image.worker.test.ts
sha256: aabdb86887ee2dacad1e73283dc433eb96beb5e6df23c616733dccd4cfdd2ed0
generated_at: 2026-10-15T13:06:40.631292+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/adapters/image.worker.test.ts

## Purpose

Unit tests for the image digest pipeline exported by `image.worker.ts`. All I/O dependencies (image store, sharp encoding, signature identification, queue, cache) are mocked so that the tests exercise only the pipeline's decision logic: which outcomes ack, which dead-letter, which requeue, and when quarantine/promoted files are cleaned up.

## Key elements

- **`contentStemOf`** — local helper that re-derives the content stem (`owner` + first 24 hex chars of SHA-256) using the same algorithm as `image.worker.ts#contentStem`, so expected values stay in sync if the hash changes.
- **`primeSuccessfulDigest`** — wires every mock to a happy-path PNG scenario (read → identify → digest → thumbnail → promote → putDerivative) so individual tests only override what they need to change.
- **`describe('digestQuarantinedImage')`** — verifies the shared pipeline: happy-path call sequence (thumbnail cut from digested bytes, not re-read), and rejection of bytes that `identifyImage` cannot classify.
- **`describe('a body that will not decode')`** — confirms a decode failure surfaces as `UnsupportedImageFormatError` (permanent) and that the job handler dead-letters it while removing the quarantine file.
- **`describe('handleImageDigestJob')`** — the bulk of the file. Covers:
  - Successful writeback → ack, quarantine removed, cache tag invalidated.
  - Writeback failure (DB transient) → rethrown (requeue), quarantine file **not** removed.
  - Writeback matching no document → promoted files removed, job still acks (`true`).
  - Malformed jobs (missing `collection`/`documentId`/`key`, `null`, `undefined`) → dead-letter, no I/O.
  - Unregistered collection → dead-letter, no I/O.
  - Decode failure at the job level → dead-letter + quarantine cleanup.
  - Storage (promote) failure → rejected (transient), quarantine preserved.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/infrastructure/adapters/image.worker.ts` | Module under test; imports `digestQuarantinedImage`, `handleImageDigestJob`, `enqueueImageDigest`, `enqueueIfImagePending`, `registerImageWritebackResolver`, `UnsupportedImageFormatError`, `ImageWriteback`. |
| `src/infrastructure/adapters/image-store.ts` | Mocked (`readQuarantined`, `promote`, `putDerivative`, `removeQuarantined`, `remove`). |
| `src/infrastructure/adapters/image.ts` | Mocked (`digestImage`, `thumbnailImage`). |
| `src/infrastructure/adapters/image-signatures.ts` | Mocked (`identifyImage`). |
| `src/infrastructure/adapters/queue.ts` | Mocked (`IMAGE_QUEUE`, `publishToQueue`). |
| `src/infrastructure/adapters/cache.ts` | Mocked (`invalidateCacheTagsLogged`); asserted to verify cache-tag invalidation on matched writebacks. |
| `src/infrastructure/adapters/logger.ts` | Spied on (`warn`, `error`, `info`, `debug`) to suppress output and assert warning on malformed jobs. |

## Notes

- **Quarantine-file removal timing is the central invariant.** The file is removed *after* a successful writeback, but *not* when the writeback itself fails—so a retry can still read the original bytes. When the writeback matches no document, the promoted (non-quarantine) files are removed instead.
- **Decode failures are permanent; storage failures are transient.** The test explicitly asserts that a decode error resolves `false` (dead-letter) while a promote/putDerivative error rejects (requeue via nack).
- **Cache-tag invalidation only fires on a matched writeback.** A no-match writeback does not call `invalidateCacheTagsLogged`, because there is no document whose cached entry needs re-warming.
- The file is truncated; the `enqueueImageDigest` / `enqueueIfImagePending` tests and the tail of the storage-failure test are not visible in the provided content.
- The doc-header states the file mirrors the three-outcome framing of `email.worker.test.ts` plus a fourth outcome (no-match writeback cleanup).
