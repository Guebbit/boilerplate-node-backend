---
source: tests/unit/infrastructure/adapters/image.worker.test.ts
sha256: aabdb86887ee2dacad1e73283dc433eb96beb5e6df23c616733dccd4cfdd2ed0
generated_at: 2026-11-08T10:07:33.592551+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/adapters/image.worker.test.ts

## Purpose

Unit tests for the image digest pipeline in `image.worker.ts`. Verifies the three-outcome queue contract (ack / dead-letter / requeue) plus a fourth case unique to this pipeline: a writeback that matches no document, which must unlink the just-promoted files. The file tests the pipeline's *decisions* (what it calls, in what order, with what arguments) while all I/O-bound collaborators are mocked.

## Key elements

- **`contentStemOf(owner, digested)`** — Local helper that replicates the SHA-256 stem derivation from `image.worker.ts#contentStem`, so expected filenames track any future hash-algorithm change automatically.
- **`primeSuccessfulDigest()`** — Wires all mocks into a happy-path PNG digest (identify → digest → thumbnail → promote → putDerivative) so individual tests only override what they're asserting against.
- **`describe('digestQuarantinedImage')`** — Verifies the pure pipeline: read → identify → digest → thumbnail → promote both, and that quarantine removal is *not* the pipeline's job. Also asserts that unidentifiable bytes are rejected before `digestImage` is reached.
- **`describe('a body that will not decode')`** — Confirms a `digestImage` rejection surfaces as `UnsupportedImageFormatError` (permanent) and that the job handler dead-letters it while clearing the quarantine file.
- **`describe('handleImageDigestJob')`** — The bulk of the file. Covers:
  - Successful writeback → ack, quarantine cleared, cache tag invalidated.
  - Writeback DB failure → rethrow (transient), quarantine **preserved** for retry.
  - Writeback returns `false` (no matching doc) → promoted files unlinked, still acks, no cache invalidation.
  - Malformed/missing job payloads → dead-letter without digesting.
  - Unregistered collection → dead-letter.
  - Decode failure → dead-letter + quarantine cleared.
  - Storage failure (rethrown) → quarantine **not** removed so retry can re-read.
- **Mock factory blocks** (`jest.mock` for image-store, image, image-signatures, queue, cache) — Each collaborator is fully faked; only `image.worker.ts` runs real code.
- **Logger spies** — `logger.warn/error/info/debug` are spied (not replaced) to assert that error paths log while keeping the real logger's chaining intact.

## Relationships

- **`src/infrastructure/adapters/image.worker.ts`** — System under test; imports `digestQuarantinedImage`, `handleImageDigestJob`, `enqueueImageDigest`, `enqueueIfImagePending`, `registerImageWritebackResolver`, `UnsupportedImageFormatError`.
- **`src/infrastructure/adapters/image-store.ts`** — Mocked; asserts call order and arguments for `readQuarantined`, `promote`, `putDerivative`, `removeQuarantined`, `remove`.
- **`src/infrastructure/adapters/image.ts`** — Mocked; `digestImage` and `thumbnailImage` are stubbed to isolate pipeline logic from encoding.
- **`src/infrastructure/adapters/image-signatures.ts`** — Mocked; `identifyImage` return value drives the format-acceptance branch.
- **`src/infrastructure/adapters/queue.ts`** — Mocked; `publishToQueue` and the `IMAGE_QUEUE` constant are available but the tests focus on the consumer side.
- **`src/infrastructure/adapters/cache.ts`** — Mocked; `invalidateCacheTagsLogged` is asserted to verify cache-tag clearing on successful writeback.
- **`src/infrastructure/adapters/logger.ts`** — Spied on (not mocked) to assert that rejection/dead-letter paths emit a `warn` while keeping the real logger chain functional.

## Notes

- The file deliberately mirrors the framing of `email.worker.test.ts` (same ack/dead-letter/requeue triad), per the header comment.
- `removeQuarantined` and `remove` are distinct: the former clears the *quarantine* staging file; the latter unlinks a *promoted* URL. Tests assert both to pin which path cleans up which artifact.
- `beforeEach` resets all mocks and re-defaults `mockedRemove` to `true` and `mockedInvalidateCacheTagsLogged` to `undefined`, so a test that forgets to set them will fail loudly rather than silently skip.
- The `registerImageWritebackResolver` call inside the "body that will not decode" describe block registers a *throwaway* resolver just to satisfy the runtime guard; the `handleImageDigestJob` describe block re-registers a proper per-collection resolver in its own `beforeEach`.
- The truncated final test (`'rejects and keeps th…'`) indicates additional requeue/transient-storage-failure assertions continue in the file.
