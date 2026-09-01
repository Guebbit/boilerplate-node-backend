# IMAGE_PIPELINE_PLAN.md

## Purpose

Design and implementation-plan document for the image upload pipeline: every uploaded image must be digested (metadata stripped, dimensions capped, recompressed) and thumbnailed **before** it is ever placed under `public/` and served with `immutable, 1y` cache headers. It exists because the previous "validate-and-publish" flow leaked EXIF data, accepted malformed payloads, and forced full-size downloads in list views.

## Key elements

- **Three-directory model** — `NODE_UPLOAD_STAGING_PATH` (ephemeral, during request), `NODE_QUARANTINE_PATH` (durable, outside `public/`, between request and job), `NODE_PUBLIC_PATH` (permanent, served). A hard boundary, not a naming convention.
- **Pipeline sequence** — `quarantineUploadedImages` → enqueue `worker.image.digest` → sharp strip/resize/re-encode → `imageStore.promote` → `imageStore.putDerivative` (thumbnail at `/images/thumbs/v1/<stem>.webp`) → conditional writeback → unlink quarantine file.
- **`pendingImageKey` field** — dual-purpose: guards against out-of-order redeliveries (stale job matches zero docs, self-cleans) and provides a queryable "stuck on placeholder" signal without a separate status enum.
- **No-broker fallback** — when `isQueueEnabled()` is false the digest runs synchronously in the request; the API contract always returns `thumbnailUrl`.
- **Writeback via `kernel/registry.ts`** — modules register an `imageTargets` entry so `infrastructure/adapters/image.worker.ts` can resolve the target collection without importing `src/modules/*`. Domain-event bus and a generic collection-name whitelist were considered and rejected.
- **Library choice: sharp 0.35.x** — selected over jimp, @napi-rs/image, canvas, gm, etc. Native libvips under the hood, 25 prebuilt platform packages, 93.8 M weekly downloads, active release cadence.
- **Failure-mode contract** — maps onto `consumeFromQueue`: `false` → dead-letter, throw → requeue. Quarantine file is unlinked on dead-letter.

## Relationships

No graph neighbors are recorded for this file. It is a planning document, not a module, so it does not appear in the import/dependency graph. It does, however, prescribe the contract that several implementation files must satisfy: `imageStore` (quarantine/read/promote/putDerivative), `infrastructure/adapters/image.worker.ts` (the digest worker), `kernel/registry.ts` (writeback resolution), and `src/app/static-assets.ts` (the immutable-caching constraint the entire design is built around).

## Notes

- **Status is mixed.** Backend steps 1–6 are implemented. The frontend follow-up section is deliberately outstanding and gated on a `sync:frontend` run that has not happened yet. `npm run test:mutation:baseline` also needs re-running.
- **The `immutable: true` + `maxAge: '1y'` header is the single constraint that shapes the whole design.** Any in-place byte rewrite after publication would be pinned for a year. Only work that produces a *new* URL may happen post-publication.
- **Format preservation.** The digested original is re-encoded to the *same* format (PNG stays PNG, JPEG stays JPEG) so the static server's extension-derived `Content-Type` remains correct. The thumbnail is always WebP because it gets a new URL/key.
- **`thumbs/v1/` versioning.** Any future change to thumbnail quality or size requires bumping the key segment (`v2`, …), not overwriting existing files, because of the same immutable caching.
- **Placeholders live under `public/images/system/`.** `imageStore.remove()` already refuses deletions inside subdirectories of `images/`, so the placeholders get deletion protection without extra code. Keep them distinct from `NODE_DEFAULT_IMAGE_PRODUCT` / `NODE_DEFAULT_IMAGE_USER` (processing ≠ never-had-an-image).
- **Job payload carries an opaque store key, never a filesystem path.** Do not copy the `pdf.worker.ts` `outputPath` pattern; it breaks the moment the store backend changes.
- **Rate-limiting the upload endpoints** is flagged as an open decision under "Things that will bite."
