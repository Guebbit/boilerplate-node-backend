---
source: tests/unit/infrastructure/adapters/image.worker.test.ts
sha256: d89ccda2b1d2e04dbd8c3444f98a9dfcb2d1f1fa678fc6fd6eb7a29c595ba01d
generated_at: 2026-09-27T16:03:55.716302+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/adapters/image.worker.test.ts

## Purpose
Unit tests for the image digest pipeline exported by `image.worker.ts`: the shared `digestQuarantinedImage` function, the queue-consumer `handleImageDigestJob`, and the `enqueueImageDigest` entry point. All I/O boundaries (image encoding, object storage, broker, cache) are mocked so that only the pipeline's decision logic and its outcome contract (ack / dead-letter / requeue / orphan-cleanup) are verified.

## Key elements
- **`primeSuccessfulDigest()`** – one-liner that wires every mock to a happy-path (PNG identified, digest + thumbnail produced, both promoted). Reused across most positive-path assertions.
- **`contentStemOf(owner, digested)`** – re-derives the storage key exactly as `image.worker.ts#contentStem` does (`sha256` hex, first 24 chars). Keeps the test in sync if the hash algorithm or slice length changes.
- **`describe('digestQuarantinedImage')`** – verifies the read → identify → digest → thumbnail → promote sequence and the format-rejection guard (no accepted magic bytes ⇒ throw before `digestImage` is called).
- **`describe('handleImageDigestJob')`** – the core three-outcome contract plus a fourth:
  - *ack* (`resolves true`): writeback matches ⇒ quarantine file removed, cache tag invalidated.
  - *requeue* (`rejects`): writeback or storage write throws ⇒ quarantine file **preserved** for the next retry.
  - *dead-letter* (`resolves false`): permanent decode failure ⇒ quarantine file cleared, job not redelivered.
  - *orphan cleanup*: writeback matches **nothing** (stale/duplicate job, deleted doc) ⇒ promoted files unlinked via `imageStore.remove`, job still acks.
  - Malformed / unregistered-collection jobs are rejected without touching the store.
- **`describe('enqueueImageDigest')`** – asserts the broker `publishToQueue` is called with the correct payload and that no digesting happens inline when the broker accepts.
- **Mock declarations** – `jest.mock` for `image-store`, `image`, `image-signatures`, `queue`, and `cache`; `jest.spyOn` for `logger` methods.

## Relationships
| Neighbor | Interaction |
|---|---|
| `src/infrastructure/adapters/image.worker.ts` | **Module under test.** Imports `digestQuarantinedImage`, `handleImageDigestJob`, `enqueueImageDigest`, `enqueueIfImagePending`, `registerImageWritebackResolver`, and the `ImageWriteback` type. |
| `src/infrastructure/adapters/image-store.ts` | Mocked; test asserts call order (promote → putDerivative → removeQuarantined) and the preserve-on-failure contract. |
| `src/infrastructure/adapters/image.ts` | Mocked (`digestImage`, `thumbnailImage`); confirms they receive the original buffer and identified MIME type. |
| `src/infrastructure/adapters/image-signatures.ts` | Mocked (`identifyImage`); drives the accept/reject branch. |
| `src/infrastructure/adapters/queue.ts` | Mocked (`publishToQueue`, `IMAGE_QUEUE`); exercised by the `enqueueImageDigest` suite. |
| `src/infrastructure/adapters/cache.ts` | Mocked (`invalidateCacheTagsLogged`); asserted to fire only on a matching writeback, never on orphan cleanup. |
| `src/infrastructure/adapters/logger.ts` | Spied (not replaced); asserts that malformed jobs and errors are logged at the expected level. |

## Notes
- The file intentionally mirrors the framing of `email.worker.test.ts` (three-outcome queue contract), adding a **fourth** outcome unique to this pipeline: writeback-matches-nothing triggers file cleanup but still acks.
- Quarantine-file removal (`removeQuarantined`) is the single most-tested sequencing concern: it must happen **after** a successful writeback, **not** on writeback failure, and **immediately** on a permanent decode failure.
- `contentStemOf` is computed at call time rather than hardcoded so that a change to the hash length in `image.worker.ts` propagates here automatically.
- The file is truncated in the snapshot; the `enqueueImageDigest` describe block likely contains additional negative-path cases (broker rejection, duplicate detection) beyond the one visible assertion.
