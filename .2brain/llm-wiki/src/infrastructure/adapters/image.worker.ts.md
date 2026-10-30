---
source: src/infrastructure/adapters/image.worker.ts
sha256: 7efa5256e8a8bb032acf52c998a77bde54a18ad001a0952037cfa6550ee8a375
generated_at: 2026-10-29T01:55:07.550890+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/adapters/image.worker.ts

## Purpose

Implements the single image-digest pipeline that turns a quarantined upload into a promoted original plus thumbnail and writes the resulting URLs back onto a waiting document. Because it sits below `@kernel`/`@modules` in the import hierarchy, it cannot import module code directly; instead it receives the writeback as an injected port at boot. Both the queued-worker path and the no-broker inline path share this one pipeline to prevent drift.

## Key elements

- **`digestQuarantinedImage(key, owner)`** — The one pipeline: read quarantine → identify MIME → re-encode (`digestImage`) → thumbnail → promote both to storage. Returns `DigestedImageUrls`. Throws `UnsupportedImageFormatError` for permanent failures; plain `Error` for transient ones (storage, disk).
- **`handleImageDigestJob(job)`** — Queue consumer entry point. Resolves the collection's writeback, runs `digestQuarantinedImage`, then settles via `settleWriteback`. Returns `false` for permanent failures (dead-letters); rethrows transient errors so `consumeFromQueue` retries.
- **`registerImageWritebackResolver(resolver)`** — Boot-time injection (called from `app/workers.ts`). Installs the function that maps a job's `collection` field to the correct `ImageWriteback`.
- **`ImageWriteback`** (type) — The inverted port: `(documentId, key, urls) => Promise<boolean>`. Structurally identical to `ImageTarget` in the kernel registry. Returns `false` when no document matched, signalling the caller to delete the promoted files.
- **`DigestedImageUrls`** — `{ imageUrl, thumbnailUrl }` — the two URLs a finished digest produces.
- **`UnsupportedImageFormatError`** — The sole permanent-failure exception; distinguishes "bytes will never decode" from transient storage errors so the worker can dead-letter vs. retry.
- **`contentStem(owner, digested)`** (internal) — Builds the storage key: `owner`-salted SHA-256 (first 24 hex chars) of the re-encoded bytes. The salt prevents cross-owner collisions and makes cleanup safe.
- **`settleWriteback`** (internal) — Shared post-digest step: calls the writeback, removes the quarantine file (best-effort), and either invalidates the cache tag (matched) or unlinks the promoted files (no match / stale job).
- **`IMAGE_QUEUE`** — Re-exported from `queue.ts` for the worker registry.

## Relationships

- **`app/workers.ts`** — Calls `registerImageWritebackResolver` at boot with a resolver built from `resolveImageTargets(enabledModules)`. This is the only place that knows all modules.
- **`image-store.ts`** — Primary I/O: `readQuarantined`, `promote`, `putDerivative`, `remove`, `removeQuarantined`.
- **`image.ts`** — Provides `digestImage`, `thumbnailImage`, and the `ReencodableImageMime` type used for narrowing.
- **`image-signatures.ts`** — `identifyImage` determines the MIME from raw bytes before re-encoding.
- **`images.generated.ts`** — `imageRuleData.formats` seeds the `REENCODABLE_MIMES` set at module load.
- **`queue.ts`** — Source of `IMAGE_QUEUE` and `publishToQueue`; this file re-exports `IMAGE_QUEUE` for the worker registry.
- **`cache.ts`** — `invalidateCacheTagsLogged([collection])` is called once the writeback matches, clearing the tag a second time so the stale placeholder is not served for the tag's TTL.
- **`logger.ts`** — Structured logging for the stale-writeback cleanup path.
- **`http/middlewares/upload.ts`** — The no-broker inline path that calls `digestQuarantinedImage` with the quarantine key as `owner` (no document ID yet).
- **`persistence/image-writeback.ts`** / **module repositories & services** — Implementations of the `ImageWriteback` port that are registered via the resolver; they perform the actual document update.

## Notes

- **Permanent vs. transient failure is load-bearing.** Only `UnsupportedImageFormatError` (wrong signature or undecodable bytes) is permanent. Every other throw is retried by `consumeFromQueue`, and the quarantine file is deliberately left in place for the retry to re-read.
- **`owner` is not always a document ID.** On the upload-middleware path (pre-write), the quarantine key itself is used as `owner`, making each upload unique rather than convergent. This is intentional: that path never retries the same key.
- **Duplicate-run safety.** A writeback that matches nothing must still return `true` if a concurrent identical run already wrote the URLs; otherwise the loser's cleanup would delete the winner's live file (same stem).
- **`REENCODABLE_MIMES` is derived from generated data, not hardcoded.** Adding a new reencodable format is a YAML edit in the image rules, not a code change here.
- **The `resolveWriteback` variable is `undefined` until boot finishes wiring.** Any job that arrives before `registerImageWritebackResolver` runs will fail with "unregistered collection" — this is the expected state for tests that import the module directly.
