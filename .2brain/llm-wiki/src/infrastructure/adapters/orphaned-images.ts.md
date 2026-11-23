---
source: src/infrastructure/adapters/orphaned-images.ts
source_sha256: b9c5798cb1c810a7bbbb3fc36c49fcc9a95bf98f21dcb801eebe90fd8fea9098
context_sha256: c0a2b73ae1f09f69f11b6765905a09fafa1c370a2ce63edfa8d03d55d911a04e
generated_at: 2026-11-22T02:40:50.735297+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/adapters/orphaned-images.ts

## Purpose
Sweeps stored images that no current document references. It is the work behind the nightly `reap:orphaned-images` job, kept as a tested function rather than living in a cron script. Orphans arise from refused uploads that never reached their close hook, replayed `POST /products` requests (the retry's upload stays), and throwaway Mongo databases reseeded under files on a persistent disk.

## Key elements
- `reapOrphanedImages(collections)` — the exported entry point. Builds the set of referenced filenames, then prunes the originals directory (`public/images`) and the thumbnails directory, logs the result, and returns an `OrphanSweep`.
- `OrphanSweep` — exported interface with `originalsChecked`, `originalsReaped`, `thumbnailsChecked` and `thumbnailsReaped` counts.
- `referencedFilenames(collections)` (private) — reads `imageUrl` and `thumbnailUrl` from every given collection with the raw Mongo driver (`mongoose.connection.db`). It returns the basenames of non-empty string URLs, or an empty set if there is no DB handle.
- `MIN_AGE_MS` — equal to `HOUR_MS`. Files younger than this are never swept.

## Relationships
- `src/app/jobs.ts` — the job layer that calls `reapOrphanedImages` (the module doc names the `reap:orphaned-images` job). The collection list is expected to come from `resolveImageTargets`'s keys.
- `src/infrastructure/adapters/filesystem.ts` — provides `pruneUnreferenced(dir, keep, minAgeMs)`, which does the file deletion and returns `{ checked, reaped }`.
- `src/infrastructure/adapters/image-store.ts` — provides `IMAGES_SEGMENT`, `publicRoot()` and `thumbnailsDirectory()`, which locate the directories to sweep.
- `src/infrastructure/adapters/logger.ts` — the sweep summary is logged through its `logger`.
- `src/domain-primitives/time.ts` — supplies `HOUR_MS`.
- `tests/integration/orphaned-images.test.ts` — tests this function.

## Notes
- The only keep test is "does a document still name this basename". Age does not matter, because promoted images are durable. The one-hour grace period exists only because an upload is promoted just before its row is saved.
- Matching is by basename only, since a promoted URL and the file on disk share only that.
- `images/seed/` and `images/system/` are never touched. `pruneUnreferenced` only handles files directly under the directory it is given, so subdirectories are skipped.
- Raw driver reads are deliberate. The sweep must reach every collection generically, the same constraint `image.worker.ts` is under, so it avoids module repositories and a new image-bearing module needs no change here.
- The log call is marked `Stryker disable` and is excluded from mutation testing.
