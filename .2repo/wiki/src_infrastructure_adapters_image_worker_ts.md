# src/infrastructure/adapters/image.worker.ts

## Purpose

Implements the single image-digest pipeline that turns a quarantined upload into a promoted original plus a thumbnail, then writes the resulting URLs back onto the waiting document. Because this adapter sits below `@kernel`/`@modules` and cannot import either, the writeback step is an inverted port (`ImageWriteback` + a boot-time registration function) supplied by `app/workers.ts`. Both the queued worker path and the no-broker inline fallback route through the same `digestQuarantinedImage` pipeline so the two cannot drift apart.

## Key elements

- **`digestQuarantinedImage(key)`** — The one pipeline: read quarantined bytes → identify MIME → digest + thumbnail in parallel → promote both to durable storage → best-effort remove the quarantine file. Throws on unsupported MIME or storage failure.
- **`handleImageDigestJob(job)`** — Entry point for the queued worker. Validates the payload, resolves the module writeback via the registered resolver, runs the pipeline, settles the writeback. Returns `false` for permanent failures (malformed payload, unregistered collection, bad decode) so the consumer dead-letters them; rejects nothing for retryable errors (those propagate to `consumeFromQueue`).
- **`enqueueImageDigest(payload, writeback)`** — Queue-aware dispatch called by a module service after persisting a document with a `pendingImageKey`. Publishes to the broker when available; otherwise (or on failed publish) runs the pipeline inline under the caller's `await`.
- **`registerImageWritebackResolver(resolver)`** — Boot-time injection point; called once from `app/workers.ts` with a resolver built from `resolveImageTargets(enabledModules)`.
- **`ImageWriteback`** — Type alias for the per-collection writeback function `(documentId, key, urls) => Promise<boolean>`. Structurally identical to `ImageTarget` in the kernel registry.
- **`DigestedImageUrls`** — `{ imageUrl, thumbnailUrl }` shape returned by the pipeline.
- **`settleWriteback`** (private) — Calls the module writeback; if it matches no document, unlinks the promoted files to avoid orphans.
- **`IMAGE_QUEUE`** (re-export) — Re-exported from `@infrastructure/adapters/queue` for the worker registry in `app/workers.ts`.
- **`REENCODABLE_MIMES` / `isReencodableMime`** (private) — Guards that only PNG, JPEG, or WebP proceed to re-encoding.

## Relationships

- **`src/app/workers.ts`** — Calls `registerImageWritebackResolver` at boot to wire the collection→writeback map; registers `handleImageDigestJob` as the consumer for `IMAGE_QUEUE`.
- **`src/infrastructure/adapters/image-store.ts`** — Provides `imageStore` (readQuarantined, promote, putDerivative, removeQuarantined, remove).
- **`src/infrastructure/adapters/image.ts`** — Provides `digestImage`, `thumbnailImage`, and the `ReencodableImageMime` type.
- **`src/infrastructure/adapters/image-signatures.ts`** — Provides `identifyImage` for MIME sniffing from raw bytes.
- **`src/infrastructure/adapters/queue.ts`** — Provides `IMAGE_QUEUE`, `isQueueEnabled`, `publishToQueue`.
- **`src/infrastructure/adapters/logger.ts`** — Provides the `logger` used for warn/error/debug lines.
- **`src/types/index.ts`** — Provides `ImageDigestJobPayload`.
- **`src/modules/products/service.ts` / `src/modules/users/service.ts`** — Call `enqueueImageDigest` after persisting a document with a pending image key.
- **`src/modules/products/repository.ts` / `src/modules/users/repository.ts`** — Supply the concrete `ImageWriteback` implementations that get registered via the resolver.
- **`tests/unit/infrastructure/adapters/image.worker.test.ts`** — Unit tests; note the module starts with `resolveWriteback` as `undefined`, which is the state tests begin in.

## Notes

- **Inverted port, not an import.** This file intentionally does *not* import from `@kernel` or `@modules`. The `ImageWriteback` type is declared here (not imported from the kernel's `ImageTarget`) to keep the dependency arrow pointing downward. The two types are kept structurally identical on purpose.
- **Boot ordering matters.** `resolveWriteback` is `undefined` until `registerImageWritebackResolver` runs. A job that arrives before boot finishes wiring will be dead-lettered (collection unregistered) rather than retried.
- **Permanent vs. retryable failures are currently indistinguishable to the caller.** Both a bad MIME decode and a storage I/O error resolve `false` in `handleImageDigestJob`. The file's docblock references `IMAGE_PIPELINE_PLAN.md` for the failure-mode table and notes this is a known simplification.
- **Quarantine cleanup is best-effort in the happy path.** `removeQuarantined` failure after a successful promote does not reject the pipeline; leftover files are reaped later by `scripts/reap-quarantine.ts`.
- **`Partial<ImageDigestJobPayload>`** in `handleImageDigestJob` reflects that the payload crossed a broker boundary; the `eslint-disable` comment documents this deliberately.
