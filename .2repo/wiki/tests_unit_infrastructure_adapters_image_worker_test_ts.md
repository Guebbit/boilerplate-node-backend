# tests/unit/infrastructure/adapters/image.worker.test.ts

## Purpose

Unit tests for the image-digest pipeline in `image.worker.ts`, covering the three public entry points (`digestQuarantinedImage`, `handleImageDigestJob`, `enqueueImageDigest`). The tests verify decision logic (ack / dead-letter / requeue, writeback cleanup, inline fallback) while mocking out all I/O: image encoding, file storage, format identification, and the message broker.

## Key elements

- **`primeSuccessfulDigest()`** – Helper that wires all mocks to a happy-path PNG digest so each test only overrides what it needs to change.
- **`describe('digestQuarantinedImage')`** – Tests the pure pipeline: read → identify → digest → thumbnail → promote both → clear quarantine. Also verifies that unidentifiable bytes are rejected before `digestImage` is called.
- **`describe('handleImageDigestJob')`** – Tests the queue-consumer contract:
  - Ack (returns `true`) when the writeback resolver matches a document.
  - Ack + unlink promoted files when the writeback matches nothing (stale/duplicate delivery).
  - Refuse (returns `false`, no digest) for malformed jobs (missing `collection`, `documentId`, `key`, or empty/null job).
  - Discard jobs for unregistered collections.
  - Dead-letter (returns `false`) + clear quarantine when digest fails permanently.
- **`describe('enqueueImageDigest')`** – Tests the dispatcher:
  - Publishes to the queue when the broker is enabled and accepts.
  - Falls back to inline execution when the broker is disabled **or** when `publishToQueue` returns `false`.
  - Verifies the inline path shares the same `settleWriteback` cleanup (removes promoted files on mismatched writeback).
- **`registerImageWritebackResolver`** – Called in `beforeEach` to inject a test-specific writeback function scoped to the `'products'` collection.

## Relationships

- **`image.worker.ts`** – The module under test; all three exported functions plus `registerImageWritebackResolver` and the `ImageWriteback` type are imported and exercised.
- **`image-store.ts`** – Fully mocked; tests assert call order and arguments for `readQuarantined`, `promote`, `putDerivative`, `removeQuarantined`, and `remove`.
- **`image.ts`** – Fully mocked; `digestImage` and `thumbnailImage` are stubbed to return canned Buffers.
- **`image-signatures.ts`** – Fully mocked; `identifyImage` returns `'image/png'` (happy path) or `undefined` (rejection path).
- **`queue.ts`** – Fully mocked; `isQueueEnabled` and `publishToQueue` drive the inline-vs-queued decision.
- **`logger.ts`** – Spied on (not replaced) to silence output and to assert `warn`/`error` are called on rejection paths.

## Notes

- The three-outcome contract (ack `true` / dead-letter `false` / requeue) mirrors the framing used in `workers.test.ts` for other queue consumers; this file adds a **fourth** case unique to image digesting: writeback matches no document, requiring cleanup of just-promoted files while still acking.
- The inline and queued paths share `settleWriteback` internally; the test suite explicitly covers the mismatched-writeback cleanup on **both** paths to guard against divergence.
- `mockedRemove` is pre-set to resolve `true` in `beforeEach` so cleanup assertions don't accidentally throw.
- The `writeback` mock is a local `jest.fn()` registered via `registerImageWritebackResolver` per `describe` block, keeping collection scoping explicit and isolated.
