# docs/tools/image-processing.md

## Purpose

Operational reference for the image digest pipeline: the path an uploaded image takes from quarantine through EXIF stripping, dimension capping, sharp re-encoding, and WebP thumbnail generation before it is promoted to the immutable `public/` store. Points to the actual code and lists the configuration knobs; the full design rationale and failure-mode table live in `IMAGE_PIPELINE_PLAN.md` at the repo root.

## Key elements

- **`digestImage` / `thumbnailImage`** (`src/infrastructure/adapters/image.ts`) — sharp wrappers that strip EXIF, cap dimensions, re-encode, and emit a WebP thumbnail.
- **`quarantineUploadedImages`** (`src/infrastructure/adapters/storage.ts`) — upload middleware; moves the staged upload into `NODE_QUARANTINE_PATH` and either enqueues a digest job or runs the pipeline inline when no broker is configured.
- **`enqueueImageDigest` / `handleImageDigestJob`** (`src/infrastructure/adapters/image.worker.ts`) — shared pipeline entry and RabbitMQ job handler; performs digest, promote, and conditional writeback.
- **`image-store.ts`** (`src/infrastructure/adapters/image-store.ts`) — storage adapter for quarantine, promote, derivative, and remove operations.
- **`IMAGE_QUEUE`** (`src/infrastructure/adapters/queue.ts`) — the queue name (`worker.image.digest`) for the digest job.
- **`registerWorkers`** (`src/app/workers.ts`) — worker registration per cluster fork; also sets `sharp.concurrency(1)` and `sharp.cache(false)` at import.
- **`ImageTarget` / `resolveImageTargets`** (`src/kernel/registry.ts`) — module writeback registration so each module declares how to persist the resulting URLs.
- **`writebackImage`** (`src/modules/products/repository.ts`, `src/modules/users/repository.ts`) — per-module conditional writeback keyed on `pendingImageKey`.
- **`scripts/backfill-image-thumbnails.ts`** — one-shot, idempotent backfill for pre-pipeline images missing `thumbnailUrl`.
- **`scripts/reap-quarantine.ts`** — deletes quarantine files older than `NODE_QUARANTINE_RETENTION_HOURS`; meant to run on a schedule.

## Relationships

No graph neighbors are recorded for this file. It cross-references two external documents: `IMAGE_PIPELINE_PLAN.md` (design rationale, rejected alternatives, failure-mode table) and `docs/tools/rabbitmq.md` (broker/fallback pattern shared with `enqueueEmail`).

## Notes

- **Immutable caching drives the whole design.** `public/` is served with `maxAge: '1y', immutable: true`, so byte mutation is forbidden after promotion. The three-tier path (staging → quarantine → public) exists to guarantee that invariant.
- **`pendingImageKey` is a concurrency guard, not just bookkeeping.** Conditional writeback on key match resolves duplicate delivery and mid-flight deletion without locks; a no-match causes the worker to unlink the files it just promoted.
- **Three distinct "no image" states** must not be conflated: the pending placeholder (`NODE_PENDING_IMAGE_URL`), the default image (`NODE_DEFAULT_IMAGE_PRODUCT` / `NODE_DEFAULT_IMAGE_USER`), and the frontend's own empty-state graphic.
- **`sharp.concurrency(1)` and `sharp.cache(false)`** are set once at import time because `registerWorkers()` runs in every cluster fork; without this, N forks × sharp's thread pool × libvips cache would multiply memory pressure.
- **Alpine/musl runtime.** `@img/sharp-linuxmusl-x64`/`-arm64` packages mean no compiler is needed, but sharp's docs flag allocator fragmentation under musl for long-lived processes.
- **Remote and default images get no thumbnail.** `thumbnailUrl` stays absent when `imageUrl` is body-supplied or a default URL; there is no local file to derive a thumbnail from.
