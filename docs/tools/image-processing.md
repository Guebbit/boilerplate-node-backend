# Image processing

Every uploaded image goes through a **digest pipeline** before it is ever served: metadata (EXIF
GPS, camera serial, capture timestamp) is stripped, dimensions are capped, and the bytes are
re-encoded through [sharp](https://sharp.pixelplumb.com/) — which is also the real content check
`validateUploadedImages`'s magic-byte read cannot be. A WebP thumbnail is produced alongside it.
Nothing reaches `public/` until both exist.

Full design rationale, rejected alternatives and the failure-mode table live in
`IMAGE_PIPELINE_PLAN.md` at the repo root. This page is the pointer to the code and the operational
knobs.

## Why quarantine

`static-assets.ts` serves `public/` with `maxAge: '1y', immutable: true` — the URL a client fetches
**is** the persisted `imageUrl`, and it can never be revalidated or cache-busted. That makes one rule
non-negotiable: **nothing that will mutate the bytes may happen after they are publicly reachable.**

So an upload lands in `NODE_QUARANTINE_PATH` first — durable (it must survive a restart while a job
is pending), but outside `NODE_PUBLIC_PATH`, so nothing unvalidated is ever fetchable. Only the
digest job promotes it.

| Path                       | Lifetime                | Durability                     | Served           |
| -------------------------- | ----------------------- | ------------------------------ | ---------------- |
| `NODE_UPLOAD_STAGING_PATH` | during the request      | ephemeral, tmp is fine         | no               |
| `NODE_QUARANTINE_PATH`     | until the job completes | **durable, outside `public/`** | no               |
| `NODE_PUBLIC_PATH`         | forever                 | durable                        | yes, `immutable` |

## Architecture

```mermaid
%%{init: {'flowchart': {'nodeSpacing': 55, 'rankSpacing': 65}}}%%
flowchart LR
    Upload[Multipart upload] -->|validate + quarantine| Quarantine[(Quarantine dir)]
    Quarantine -->|broker configured| RMQ[(worker.image.digest)]
    Quarantine -->|no broker| Inline[Digest inline, in the request]
    RMQ --> Worker[image.worker.ts]
    Inline --> Digest
    Worker --> Digest[digestImage + thumbnailImage]
    Digest --> Public[(Public store)]
    Digest --> Writeback[Conditional writeback]
    Writeback --> DB[(MongoDB)]

    classDef app fill:#dbeafe,stroke:#2563eb,color:#111827;
    classDef queue fill:#fef3c7,stroke:#d97706,color:#111827;
    classDef worker fill:#dcfce7,stroke:#16a34a,color:#111827;
    classDef store fill:#ede9fe,stroke:#7c3aed,color:#111827;
    class Upload,Inline app;
    class RMQ queue;
    class Worker,Digest worker;
    class Quarantine,Public,DB,Writeback store;
```

## Where the code lives

| Concern                                          | File                                                                  |
| ------------------------------------------------ | --------------------------------------------------------------------- |
| sharp wrapper — `digestImage`/`thumbnailImage`   | `src/infrastructure/adapters/image.ts`                                |
| Storage — quarantine/promote/derivative/remove   | `src/infrastructure/adapters/image-store.ts`                          |
| Upload middleware — quarantine + inline fallback | `src/infrastructure/adapters/storage.ts` → `quarantineUploadedImages` |
| Shared pipeline + queue worker + inline dispatch | `src/infrastructure/adapters/image.worker.ts`                         |
| Queue name                                       | `src/infrastructure/adapters/queue.ts` → `IMAGE_QUEUE`                |
| Worker registration                              | `src/app/workers.ts`                                                  |
| Module writeback registration                    | `src/kernel/registry.ts` → `ImageTarget`, `resolveImageTargets`       |
| `products` writeback                             | `src/modules/products/repository.ts` → `writebackImage`               |
| `users`/`account` writeback                      | `src/modules/users/repository.ts` → `writebackImage`                  |
| Quarantine reaper                                | `scripts/reap-quarantine.ts`                                          |

## How it's used

### Queue enabled (the normal path)

1. `quarantineUploadedImages` quarantines the staged upload and sets `request.quarantinedImageKeys`.
2. The controller persists the document with the pending-image placeholder
   (`imageUrl`/`thumbnailUrl`) and the quarantine key as `pendingImageKey`.
3. The module's service calls `enqueueImageDigest`, which publishes to `worker.image.digest`.
4. `handleImageDigestJob` digests, promotes both files, then writes back — **conditionally**, on
   `pendingImageKey` still matching the job's key — before clearing the quarantine file.

### No broker (fallback)

`quarantineUploadedImages` runs the entire pipeline inline, synchronously, before the request
reaches the controller. The response carries the real `imageUrl`/`thumbnailUrl` immediately; the
placeholder and `pendingImageKey` are never touched. Same shape as `enqueueEmail` falling back to
sending inline — see `docs/tools/rabbitmq.md`.

### Why the writeback is conditional

`pendingImageKey` is not bookkeeping — it is what makes two concurrency problems resolve
themselves instead of needing a lock:

- **A second upload racing the first job.** The writeback only applies when `pendingImageKey`
  still equals the job's key. A stale/duplicate delivery therefore matches nothing, and the worker
  unlinks the files it just promoted rather than overwriting a newer upload.
- **The document being deleted mid-flight.** Same mechanism — no match, no orphaned write, files
  cleaned up.

It also makes `db.products.find({ pendingImageKey: { $exists: true } })` the answer to "which
records are stuck on the placeholder", with the dead-letter queue explaining why.

## The pending-image placeholder

`public/images/system/pending.png` and `public/images/system/pending-thumb.webp` are committed,
blank placeholders — override with `NODE_PENDING_IMAGE_URL` / `NODE_PENDING_THUMBNAIL_URL`. They
are a real, fetchable url for the duration of the digest job, distinct from
`NODE_DEFAULT_IMAGE_PRODUCT` / `NODE_DEFAULT_IMAGE_USER` (a record that never had an upload at
all) and from the frontend's own "no image" placeholder — three different states worth telling
apart.

## Configuration

| Variable                          | Default                             | Meaning                                                                                           |
| --------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------- |
| `NODE_QUARANTINE_PATH`            | `quarantine`                        | Where uploads wait between staging and digesting                                                  |
| `NODE_IMAGE_MAX_INPUT_PIXELS`     | `50_000_000`                        | Decompression-bomb guard, checked before any resize                                               |
| `NODE_IMAGE_MAX_DIMENSION`        | `2048`                              | Longest edge of a digested original                                                               |
| `NODE_IMAGE_THUMBNAIL_DIMENSION`  | `320`                               | Longest edge of a thumbnail                                                                       |
| `NODE_PENDING_IMAGE_URL`          | `/images/system/pending.png`        | Placeholder shown while a digest job is pending                                                   |
| `NODE_PENDING_THUMBNAIL_URL`      | `/images/system/pending-thumb.webp` | Placeholder thumbnail, same lifetime as the above                                                 |
| `NODE_QUARANTINE_RETENTION_HOURS` | `24`                                | Age at which `reap:quarantine` unlinks a leftover file                                            |
| `NODE_MAX_UPLOAD_BYTES`           | `5242880` (5 MB)                    | Largest file multer accepts, per file — its own default is unlimited, so this is the only ceiling |

## Maintenance

- **`npm run reap:quarantine`** — deletes quarantine files older than
  `NODE_QUARANTINE_RETENTION_HOURS`. Meant to run periodically (cron, a scheduled container task);
  a normal run of the pipeline never leaves a file behind for it to find.

## Operational notes

- **`sharp.concurrency(1)` and `sharp.cache(false)`** are set once, at import — `registerWorkers()`
  runs in every cluster fork, so without this a multi-core deployment runs N forks × sharp's own
  thread pool × libvips's own cache.
- **Alpine/musl.** The runtime image is `node:25-alpine`. `@img/sharp-linuxmusl-x64`/`-arm64` both
  exist, so `npm install` needs no compiler, but sharp's own docs flag allocator fragmentation
  under musl for long-running processes — worth a `k6` soak test before relying on it at scale.
- **Remote and default images get no thumbnail.** `thumbnailUrl` stays absent when `imageUrl` is a
  body-supplied or default url rather than an upload; there is nothing local to derive one from.
