---
source: src/infrastructure/adapters/orphaned-images.ts
sha256: 2a06b4e7210833c3de46f06ed01f810f9b10f1f9066ffd2759b72a573dc5e011
generated_at: 2026-11-08T03:22:09.505504+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/adapters/orphaned-images.ts

## Purpose

Sweeps image files from the public disk that are no longer referenced by any live document. It isolates the `reap:orphaned-images` nightly job's logic into a tested, reusable function rather than embedding it in the cron script. Orphans typically arise from interrupted uploads (file written, close hook never ran) or from throwaway databases reseeded against a persistent disk.

## Key elements

- **`reapOrphanedImages(collections: readonly string[]): Promise<OrphanSweep>`** — Main entry point. Collects the set of filenames still in use across the given collections, then calls `pruneUnreferenced` on both the originals directory and the thumbnails directory. Returns a tally of files checked vs. removed per directory.
- **`OrphanSweep`** — Interface describing one sweep's results: `originalsChecked`, `originalsReaped`, `thumbnailsChecked`, `thumbnailsReaped`.
- **`referencedFilenames(collections)`** *(private)* — Reads `imageUrl` and `thumbnailUrl` from every row in the supplied collections via the raw Mongoose driver (bypassing module repositories), and returns a `Set<string>` of basenames. Returns an empty set if no connection is active.
- **`MIN_AGE_MS`** — Set to `HOUR_MS`. Files younger than one hour are never deleted, covering the window between upload promotion and row persistence.

## Relationships

- **`src/app/jobs.ts`** — Imports and invokes `reapOrphanedImages` as the body of the `reap:orphaned-images` scheduled job.
- **`src/infrastructure/adapters/filesystem.ts`** — Provides `pruneUnreferenced`, the actual on-disk delete routine that this module delegates to.
- **`src/infrastructure/adapters/image-store.ts`** — Supplies `IMAGES_SEGMENT`, `publicRoot`, and `thumbnailsDirectory` so the sweep targets the same paths the rest of the system uses.
- **`src/infrastructure/adapters/logger.ts`** — Used to emit a single `info` log line summarising each sweep.
- **`src/domain-primitives/time.ts`** — Source of the `HOUR_MS` constant used for the minimum-age guard.
- **`tests/integration/orphaned-images.test.ts`** — Integration tests exercising the sweep end-to-end.

## Notes

- The `collections` parameter is expected to be the keys of `resolveImageTargets`, so adding a new module that stores image URLs requires **no change** to this file — just pass its collection name.
- `pruneUnreferenced` only ever touches files *directly* under the directory it receives; sub-directories (`images/seed/`, `images/system/`, `images/thumbs/`) are inherently untouched, mirroring the `.gitignore` `public/images/*` carve-out.
- Reference matching is **basename-only** (e.g. `42.png`), not full-path. A promoted URL and the on-disk file share the same basename regardless of any URL-prefix differences.
- The raw Mongoose driver is used deliberately (not a module's repository) because the sweep must reach every collection generically — the same constraint noted for `image.worker.ts`.
- The `Stryker disable` comment above the `logger.info` call suppresses mutation testing for that single line.
