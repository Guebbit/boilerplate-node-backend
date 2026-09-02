# IMAGE_PIPELINE_PLAN.md

## Purpose

Design and status document for the image upload pipeline: quarantine → digest (metadata strip, dimension cap, re-encode) → thumbnail generation → promote to `public/`. It exists to justify why images are never served from `public/` until fully processed, and to record the architectural decisions (three-directory model, conditional writeback, no-broker fallback) so they aren't re-litigated. Status: implemented on both backend and frontend.

## Key elements

- **Three-directory model** — `NODE_UPLOAD_STAGING_PATH` (request-scoped, ephemeral), `NODE_QUARANTINE_PATH` (durable, outside `public/`), `NODE_PUBLIC_PATH` (forever, `immutable`). Enforced by the filesystem, not by naming convention.
- **Pipeline flow** — `multer` → `validateUploadedImages` → `imageStore.quarantine()` → enqueue `worker.image.digest` job (or run inline if broker absent) → 201 with placeholder URLs.
- **`worker.image.digest` job** — reads quarantine key, runs sharp (strip metadata, cap dimensions, re-encode same format), generates a WebP thumbnail, calls `imageStore.promote()` and `imageStore.putDerivative()`, then conditionally updates the record via `pendingImageKey` and unlinks the quarantine file.
- **`pendingImageKey`** — stored on the document during the pending window; used as a guard in the conditional `updateOne` to handle concurrent uploads, stale jobs, and mid-flight document deletion. Doubles as an observability query target.
- **No-broker fallback** — when `isQueueEnabled()` is false, digest runs synchronously in the request; placeholder URLs are never returned.
- **Writeback via `kernel/registry.ts`** — modules register an `imageTargets` entry; the worker resolves by key. Chosen over the event bus (swallows throws) and a generic collection allowlist (leaks module names into infrastructure).
- **`thumbs/v1/` path segment** — versioned key namespace for thumbnails so future quality/algorithm changes don't collide with `immutable` cache headers.
- **Placeholders** — `pending.png` / `pending-thumb.webp` under `images/system/`, overridable via env vars. Deletion-protected by the existing `imageStore.remove()` subdirectory guard.
- **Library choice: sharp** — native libvips wrapper; 25 prebuilt platform packages; runs on libuv threadpool (non-blocking). Chosen over jimp, @napi-rs, canvas, gm, etc. (comparison table in the file).

## Relationships

No graph neighbors recorded for this file. It is a standalone design document and does not appear in the dependency graph. (It *references* `http/middlewares/rate-limit.ts`, `src/app/static-assets.ts`, `infrastructure/adapters/image.worker.ts`, `kernel/registry.ts`, `kernel/events.ts`, and `pdf.worker.ts`, but none of those form a graph edge to this file.)

## Notes

- The single governing constraint: `express.static` serves `public/` with `maxAge: '1y', immutable: true`, and the URL **is** the persisted `imageUrl`. Anything that mutates bytes must happen *before* publication; only new-URL work may happen after.
- The job payload carries an **opaque store key**, never a filesystem path (unlike `pdf.worker.ts`'s `outputPath`). This keeps the store backend-agnostic.
- The digest re-encodes to the **same** format as the upload (JPEG stays JPEG, PNG stays PNG) to avoid `Content-Type` / extension mismatches. Only the thumbnail is free to be WebP (new key).
- Outstanding: `npm run test:mutation:baseline` needs re-baselining after this feature shipped.
- The upload rate-limit question is resolved: `uploadLimiter` in `http/middlewares/rate-limit.ts`; see `docs/tools/security.md#the-rate-limit-budgets`.
- This is a **plan/design doc**, not executable code. The "Key elements" above are the architectural decisions and API surface it prescribes, not importable symbols.
