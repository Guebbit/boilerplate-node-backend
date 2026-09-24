---
source: tests/unit/infrastructure/adapters/image.worker.test.ts
sha256: 5815558f6cbf0b7979da2b16f49fe61089a001aa285f1928ec0da6d11283247a
generated_at: 2026-09-23T20:17:56.692631+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/adapters/image.worker.test.ts

## Purpose

Unit tests for the image digest pipeline (`digestQuarantinedImage`, `handleImageDigestJob`, `enqueueImageDigest`) in `image.worker.ts`. It verifies the pipeline's **decision logic** — which files get promoted, removed, acked, dead-lettered, or requeued — while mocking out all I/O (sharp, store, queue, cache). The framing mirrors `email.worker.test.ts`: a three-outcome contract (ack / dead-letter / requeue) plus a fourth case unique to this pipeline (writeback mismatch requires file cleanup on both the queued and inline path).

## Key elements

- **`contentStemOf(owner, digested)`** — local helper that re-derives the SHA-256 stem exactly as `image.worker.ts#contentStem` does, so expected values move with any algorithm change.
- **`primeSuccessfulDigest()`** — wires all mocks to a happy-path PNG digest (read → identify → digest → thumbnail → promote → putDerivative → removeQuarantined).
- **`describe('digestQuarantinedImage')`** — tests the shared pipeline in isolation: full happy path and rejection of bytes that don't identify as an accepted format.
- **`describe('handleImageDigestJob')`** — tests the queue consumer:
  - acks when writeback resolves `true`
  - invalidates the collection cache tag after a matched writeback
  - cleans up promoted files and still acks when writeback resolves `false` (stale/duplicate/delete)
  - refuses malformed jobs (missing fields, null, undefined) without digesting
  - discards jobs naming an unregistered collection
  - dead-letters (`resolves false`) + clears quarantine on permanent decode failure
  - rejects (rethrows) + preserves quarantine on transient storage failure (requeue)
- **`describe('enqueueImageDigest')`** — tests the enqueue entry point:
  - publishes to the queue and skips inline work when the broker accepts
  - runs the full pipeline inline when `isQueueEnabled` returns `false`

## Relationships

- **`src/infrastructure/adapters/image.worker.ts`** — module under test; all exported functions and the `ImageWriteback` type are imported here.
- **`src/infrastructure/adapters/image-store.ts`** — fully mocked (`readQuarantined`, `promote`, `putDerivative`, `removeQuarantined`, `remove`); assertions verify which lifecycle step fires.
- **`src/infrastructure/adapters/image.ts`** — mocked (`digestImage`, `thumbnailImage`); confirms the pipeline passes correct buffers and format strings.
- **`src/infrastructure/adapters/image-signatures.ts`** — mocked (`identifyImage`); drives the accepted/rejected-format branch.
- **`src/infrastructure/adapters/queue.ts`** — mocked (`isQueueEnabled`, `publishToQueue`, `IMAGE_QUEUE`); controls the enqueue-vs-inline fork.
- **`src/infrastructure/adapters/cache.ts`** — mocked (`invalidateCacheTagsLogged`); asserted as a side-effect of a successful writeback.
- **`src/infrastructure/adapters/logger.ts`** — spied on (`warn`, `error`, `info`, `debug`); ensures refusal paths log without crashing.

## Notes

- **Permanent vs. transient failure distinction is the core behavioral contract.** A bad decode (unidentifiable bytes) is permanent → resolves `false` (dead-letter) and clears quarantine. A storage write failure is presumed transient → rejects (requeue) and preserves the quarantine file. Mixing these up would either lose data or spam retries.
- **Cache invalidation is asserted, not optional.** A successful writeback must call `invalidateCacheTagsLogged` with the collection name; a silent writeback (no cache sweep) is treated as a test failure.
- **`contentStemOf` is intentionally re-implemented**, not imported, so the test independently verifies the derivation logic. If the hash algorithm or slice length in the worker changes, this test fails until updated.
- The file is truncated in this view; the `enqueueImageDigest` inline-path test and any further cases continue past the cutoff.
