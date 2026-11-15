---
source: src/infrastructure/adapters/orphaned-images.ts
sha256: 584ebc0c073b361ab5f28497636530fda4576f7dac26376d9d0dff72346bbba0
generated_at: 2026-11-14T17:54:21.608063+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/adapters/orphaned-images.ts

## Purpose

Implements the nightly `reap:orphaned-images` sweep: it compares every file on disk in the originals and thumbnails directories against the set of filenames still referenced by live documents, then deletes anything unreferenced. Kept as a standalone, tested function rather than inlined into a cron script so the logic is unit-testable and independent of job scheduling.

## Key elements

- **`reapOrphanedImages(collections)`** *(exported)* — Entry point. Resolves the two image directories, gathers the live reference set, calls `pruneUnreferenced` on each, and returns an `OrphanSweep` summary. Logs the result via `logger.info`.
- **`OrphanSweep`** *(exported interface)* — `{ originalsChecked, originalsReaped, thumbnailsChecked, thumbnailsReaped }` — the audit record of one sweep.
- **`referencedFilenames(collections)`** *(internal)* — Queries every supplied collection through the raw Mongoose driver (no repository layer), extracts `imageUrl` / `thumbnailUrl` strings, and returns a `Set` of basenames still in use.
- **`MIN_AGE_MS`** — Set to `HOUR_MS`; files younger than this are never deleted (guards against a promoted image that hasn't yet been saved to its row).

## Relationships

- **`src/app/jobs.ts`** — The caller. Registers the nightly `reap:orphaned-images` job that invokes `reapOrphanedImages`.
- **`src/infrastructure/adapters/filesystem.ts`** — Provides `pruneUnreferenced`, the actual file-deletion primitive. This module delegates all disk I/O to it.
- **`src/infrastructure/adapters/image-store.ts`** — Supplies the directory layout constants (`IMAGES_SEGMENT`, `publicRoot`, `thumbnailsDirectory`) so paths stay consistent with the rest of the image pipeline.
- **`src/domain-primitives/time.ts`** — Source of `HOUR_MS`, the minimum-age threshold.
- **`src/infrastructure/adapters/logger.ts`** — Structured logging of sweep results.
- **`tests/integration/orphaned-images.test.ts`** — Integration test that exercises the sweep end-to-end against a real filesystem and in-memory Mongo.

## Notes

- **Raw-driver query, not repositories.** `referencedFilenames` intentionally bypasses module-specific repositories and reads `imageUrl`/`thumbnailUrl` via `mongoose.connection`. A new domain module that stores image URLs needs only to appear in the `collections` array passed by the job; no change to this file.
- **Basename comparison only.** The reference set stores `path.basename(url)`, not full paths. Promoted URLs and on-disk files share only their filename; directories are handled separately by `pruneUnreferenced`.
- **Subdirectory carve-out.** `pruneUnreferenced` (in `filesystem.ts`) only removes files *directly* in the given directory. Subdirectories like `images/seed/`, `images/system/`, `images/thumbs/` are untouched — the same boundary the `.gitignore` `public/images/*` rule draws.
- **Age is a safety net, not a policy.** A file older than one hour is still kept if any document references it. Conversely, a file younger than one hour is kept *even if* unreferenced, to avoid racing an in-flight promotion.
- **Stryker annotation.** The `logger.info` line is excluded from mutation testing (`Stryker disable next-line all`) because it is a side-effect-only statement.
