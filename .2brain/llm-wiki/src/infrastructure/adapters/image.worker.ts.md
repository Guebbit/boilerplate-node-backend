---
source: src/infrastructure/adapters/image.worker.ts
sha256: 04db65472cacc752300c8f1ebdd89caac17651d01ec620ab4e86cdd6b1f75004
generated_at: 2026-09-27T14:06:17.145115+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/adapters/image.worker.ts

## Purpose

Implements the single image-digest pipeline that turns a quarantined upload into a promoted original plus thumbnail, then writes the resulting URLs back onto the waiting document. Because this file lives in `infrastructure/adapters` (below `@kernel`/`@modules`), it cannot import module code directly; the writeback is an **inverted port** (`ImageWriteback`) registered at boot by `app/workers.ts`. Both the queued worker path and the no-broker inline path share the same `digestQuarantinedImage` function so the two can never drift apart.

## Key elements

- **`IMAGE_QUEUE`** (re-export) — the queue name for digest jobs, owned by `queue.ts`, re-exported here for the worker registry.
- **`UnsupportedImageFormatError`** — the *only* permanent failure class. Thrown when bytes will never decode as PNG/JPEG/WebP. Callers dead-letter the job and remove the quarantine file. Every other throw is treated as transient and retried.
- **`contentStem(owner, digested)`** (internal) — builds the storage key: `${owner}-${sha256(digested).slice(0,24)}`. The `owner` salt prevents a stale run's cleanup from deleting a different document's live file.
- **`DigestedImageUrls`** — `{ imageUrl, thumbnailUrl }`, the pair a finished digest produces.
- **`ImageWriteback`** (type) — `(documentId, key, urls) => Promise<boolean>`. The boolean indicates whether the document matched; `false` triggers promoted-file cleanup. Structurally identical to `ImageTarget` in the kernel registry but re-declared here to avoid the import.
- **`registerImageWritebackResolver(resolver)`** — boot-time hook (called from `app/workers.ts`) that installs the collection→writeback lookup. `undefined` until called.
- **`digestQuarantinedImage(key, owner)`** — the shared pipeline: `readQuarantined` → `identifyImage` → `digestImage` + `thumbnailImage` → `promote` + `putDerivative`. Leaves the quarantine file in place; the caller removes it after durable writeback.
- **`settleWriteback(...)`** (internal) — calls the module writeback, then either cleans up promoted files (no match) or invalidates the collection's cache tag (match). Also removes the quarantine file.
- **`handleImageDigestJob(job)`** — queue consumer. Validates payload, resolves the collection's writeback, runs `digestQuarantinedImage` + `settleWriteback`. Returns `false` (dead-letter) for malformed payload, unregistered collection, or `UnsupportedImageFormatError`; rethrows other errors so `consumeFromQueue` retries.

## Relationships

| Neighbor | Interaction |
|---|---|
| `app/workers.ts` | Calls `registerImageWritebackResolver` once at boot to inject the collection→writeback map. |
| `adapters/image.ts` | Imports `digestImage`, `thumbnailImage`, and the `ReencodableImageMime` type for re-encoding and MIME narrowing. |
| `adapters/image-signatures.ts` | Imports `identifyImage` to sniff the real MIME from raw bytes before re-encoding. |
| `adapters/image-store.ts` | Imports `imageStore` for `readQuarantined`, `promote`, `putDerivative`, `remove`, and `removeQuarantined`. |
| `adapters/queue.ts` | Imports `IMAGE_QUEUE` (re-exported) and `publishToQueue` (available to callers like `upload.ts` that enqueue a job instead of running inline). |
| `adapters/cache.ts` | Imports `invalidateCacheTagsLogged`; called in `settleWriteback` after a successful writeback to make the finished digest visible. |
| `adapters/logger.ts` | Imports `logger` for structured warn/info messages on discard and cleanup paths. |
| `types/index.ts` | Imports `ImageDigestJobPayload` for the queue job shape. |
| `http/middlewares/upload.ts` | The no-broker inline path: calls `digestQuarantinedImage(key, key)` directly (no document id yet) and handles the result synchronously. |
| `modules/products/*`, `modules/users/*` | Their repositories provide the `ImageWriteback` implementations resolved at boot; their services enqueue `IMAGE_QUEUE` jobs on upload. |
| `tests/…/image.worker.test.ts` | Unit tests exercise `digestQuarantinedImage`, `handleImageDigestJob`, and the writeback/cleanup paths. |

## Notes

- **Inverted dependency:** this file deliberately cannot import from `@kernel` or `@modules`. The writeback is injected via `registerImageWritebackResolver`; until that call, `resolveWriteback` is `undefined` and any arriving job is discarded with a warning. Tests that import this module start in that unregistered state.
- **Permanent vs. transient failure is binary:** only `UnsupportedImageFormatError` is permanent (same bytes, same result on every retry). A storage write failure, disk-full, or a DB call in the writeback is all treated as transient and rethrown so the broker retries.
- **Quarantine file lifecycle:** the file is *not* deleted during `digestQuarantinedImage`. It is removed in `settleWriteback` only after the writeback returns (or in the `UnsupportedImageFormatError` catch in `handleImageDigestJob`). A leftover is swept by `scripts/ops/reap-quarantine.ts` as a safety net.
- **Double cache invalidation:** the write that enqueued the job already cleared the collection tag. `settleWriteback` clears it a *second* time after the digest completes, because the first clear re-warmed a response that still carried placeholder URLs. Without the second clear, the placeholder persists for the tag's full TTL.
- **`owner` parameter:** pass the target document's id when one exists (queue path, inline retry); pass the quarantine key itself when no document id exists yet (`upload.ts` pre-write path). This is what makes idempotent re-runs converge on the same file while keeping cross-document files isolated.
