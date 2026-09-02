# docs/tools/image-processing.md

## Purpose

Documents the image upload → digest → publish pipeline: how uploaded images are quarantined, re-encoded (EXIF stripped, dimensions capped, sharp re-encode + WebP thumbnail), promoted to the immutable `public/` store, and written back to MongoDB conditionally. Serves as the operational pointer to the code and configuration knobs; the full design rationale lives in `IMAGE_PIPELINE_PLAN.md` at the repo root.

## Key elements

- **Quarantine model** — three-path lifecycle: `NODE_UPLOAD_STAGING_PATH` (ephemeral, request-scoped) → `NODE_QUARANTINE_PATH` (durable, outside `public/`) → `NODE_PUBLIC_PATH` (served with `maxAge: 1y, immutable`). Nothing is publicly reachable before both original + thumbnail exist.
- **`digestImage` / `thumbnailImage`** (`src/infrastructure/adapters/image.ts`) — sharp wrapper that strips EXIF, caps dimensions, re-encodes, and produces the WebP thumbnail.
- **`quarantineUploadedImages`** (`src/infrastructure/adapters/storage.ts`) — upload middleware; quarantines files and either enqueues a digest job or runs the pipeline inline (no-broker fallback).
- **`handleImageDigestJob`** (`src/infrastructure/adapters/image.worker.ts`) — worker entry point: digest → promote → conditional writeback → unlink quarantine.
- **Conditional writeback** — `pendingImageKey` on the document is matched against the job's key before writing `imageUrl`/`thumbnailUrl`; prevents stale deliveries and races without a lock.
- **`reap:quarantine`** (`scripts/reap-quarantine.ts`) — periodic cleanup of quarantine files older than `NODE_QUARANTINE_RETENTION_HOURS`.
- **Pending placeholders** — committed blank PNG/WebP at `public/images/system/pending.*`, overridable via `NODE_PENDING_IMAGE_URL` / `NODE_PENDING_THUMBNAIL_URL`; distinct from default images and frontend "no image" state.

## Relationships

No graph-neighbor files are registered for this document. It references code across `src/infrastructure/adapters/`, `src/modules/`, `src/kernel/registry.ts`, `src/app/workers.ts`, and `scripts/`, but none of those files are tracked as dependency-graph neighbors here.

## Notes

- **Sharp concurrency** — `sharp.concurrency(1)` and `sharp.cache(false)` are set at import; without them, a multi-core deployment multiplies sharp's internal thread pool × libvips cache per fork.
- **Alpine/musl** — runtime is `node:25-alpine`; prebuilt `@img/sharp-linuxmusl-*` packages avoid a compiler, but musl allocator fragmentation under long-running processes is flagged by sharp's docs (soak-test before scaling).
- **Remote/default images skip thumbnails** — `thumbnailUrl` is simply absent when `imageUrl` was body-supplied or is a default; there is no local file to derive one from.
- **Queue vs. inline** — the no-broker path runs the entire pipeline synchronously before the controller; the response carries real URLs and `pendingImageKey` is never set. Same fallback pattern as `enqueueEmail` (see `docs/tools/rabbitmq.md`).
- **`pendingImageKey` is not bookkeeping** — it is the concurrency mechanism; `db.products.find({ pendingImageKey: { $exists: true } })` surfaces stuck records.
