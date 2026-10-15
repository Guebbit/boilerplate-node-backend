---
source: src/infrastructure/adapters/orphaned-images.ts
sha256: 355e0746ec8f5ac500225e5c01b360baaf41cde1ca11dc7ced3ac830969d0a2f
generated_at: 2026-10-15T09:49:34.154840+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/adapters/orphaned-images.ts

## Purpose

Implements the sweep that deletes stored image files no longer referenced by any live document. Extracted from the nightly `reap:orphaned-images` cron script so the logic is a tested, reusable function. Orphans typically arise from a refused upload whose close hook never fired, or from a throwaway Mongo that was reseeded while files persisted on disk.

## Key elements

- **`reapOrphanedImages(collections)`** (exported) — Scans `images/` and `images/thumbs/` for files whose basename is absent from the live reference set, deletes them via `pruneUnreferenced`, logs a summary, and returns an `OrphanSweep` count.
- **`OrphanSweep`** (exported interface) — Shape of the result: `originalsChecked/Reaped` and `thumbnailsChecked/Reaped`.
- **`referencedFilenames(collections)`** (module-private) — Queries every supplied collection via the raw Mongoose driver, collects all `imageUrl`/`thumbnailUrl` basenames into a `Set<string>`.
- **`MIN_AGE_MS`** — One-hour floor; files younger than this are never swept (guards the promote-then-save window).

## Relationships

- **`scripts/ops/reap-orphaned-images.ts`** — The cron entry point that calls `reapOrphanedImages`; this file is the actual work.
- **`src/infrastructure/adapters/filesystem.ts`** — Supplies `pruneUnreferenced`, the low-level "delete files in a directory whose names are not in a keep-set" primitive.
- **`src/infrastructure/adapters/image-store.ts`** — Supplies `IMAGES_SEGMENT`, `publicRoot`, and `thumbnailsDirectory` (the two directory paths that get swept).
- **`src/infrastructure/adapters/logger.ts`** — Structured log after each sweep.
- **`tests/integration/orphaned-images.test.ts`** — Integration tests for the sweep against a real Mongo + temp directories.

## Notes

- `referencedFilenames` deliberately uses the raw Mongoose driver (`database.collection(...).find`) rather than any module's repository, so it can reach *any* collection generically. Adding a new image-bearing module means passing its collection name in `collections`—no code change here.
- Matching is **basename-only** (no directory, no full path), because a promoted `imageUrl` and the on-disk file share only the filename.
- `pruneUnreferenced` (in `filesystem.ts`) only touches files *directly* under the directory passed to it, so `images/seed/` and `images/system/` are inherently excluded.
- The age guard (`MIN_AGE_MS`) is the only temporal safety net; there is no reference-count or tombstone mechanism.
- The `logger.info` line carries a `// Stryker disable next-line all` comment, so mutation testing skips it.
